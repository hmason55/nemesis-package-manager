package dev.nemesis.usbmanager;

import java.io.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;
import static org.junit.Assert.*;

public class StalledOperationsTest {
    private static class WaitingProcess extends Process {
        final CountDownLatch release = new CountDownLatch(1);
        final boolean blockOutput;
        volatile boolean destroyed;
        WaitingProcess(boolean blockOutput) { this.blockOutput = blockOutput; }
        public OutputStream getOutputStream() { return new ByteArrayOutputStream(); }
        public InputStream getErrorStream() { return new ByteArrayInputStream(new byte[0]); }
        public InputStream getInputStream() {
            return new InputStream() {
                public int read() throws IOException {
                    if (blockOutput) try { release.await(); }
                    catch (InterruptedException error) { throw new IOException("interrupted", error); }
                    return -1;
                }
            };
        }
        public int waitFor() throws InterruptedException { release.await(); return 0; }
        public int exitValue() { if (release.getCount() != 0) throw new IllegalThreadStateException(); return 0; }
        public void destroy() { destroyed = true; release.countDown(); }
    }
    @Test public void readOnlyQueriesRecoverFromStalledOutputAndStalledExit() {
        for (boolean output : new boolean[] {true, false}) {
            WaitingProcess process = new WaitingProcess(output);
            NemesisCli.Result result = NemesisCli.query(command -> process, 500, "pkg-list");
            assertEquals(1, result.rc);
            assertTrue(result.out.contains("timed out"));
            assertTrue(result.out.contains("Refresh"));
            assertTrue(process.destroyed);
        }
    }
    @Test public void interruptedQueryPreservesInterruptionAndStopsOnlyItsReadProcess() {
        WaitingProcess process = new WaitingProcess(true);
        Thread.currentThread().interrupt();
        try {
            NemesisCli.Result result = NemesisCli.query(command -> process, 5000, "pkg-info", "fixture.zip");
            assertEquals(1, result.rc);
            assertTrue(result.out.contains("interrupted"));
            assertTrue(Thread.currentThread().isInterrupted());
        } finally { Thread.interrupted(); process.release.countDown(); }
    }
    @Test public void mutatingCommandIsAllowedToFinishWithoutBeingDestroyed() throws Exception {
        WaitingProcess process = new WaitingProcess(false);
        CountDownLatch entered = new CountDownLatch(1);
        AtomicReference<NemesisCli.Result> result = new AtomicReference<NemesisCli.Result>();
        Thread worker = new Thread(() -> result.set(NemesisCli.run(command -> { entered.countDown(); return process; }, "install", "fixture.zip")));
        worker.setDaemon(true);
        worker.start();
        try {
            assertTrue(entered.await(5, TimeUnit.SECONDS));
            assertTrue(worker.isAlive());
            assertFalse(process.destroyed);
        } finally { process.release.countDown(); worker.join(5000); }
        assertFalse(worker.isAlive());
        assertNotNull(result.get());
        assertEquals(0, result.get().rc);
        assertFalse(process.destroyed);
    }
    @Test public void missingUpdateResultShowsGuidanceWhileRetainingOwnership() throws Exception {
        File marker = Files.createTempFile("stalled-update-", ".result").toFile();
        Files.write(marker.toPath(), "malformed".getBytes(StandardCharsets.UTF_8));
        OperationCoordinator owner = new OperationCoordinator(0);
        assertTrue(owner.start("Updating Package Manager", () -> new OperationCoordinator.Completion(UpdateHandoff.awaitResult(marker) == 0, "done")));
        try {
            assertTrue(owner.isRunning());
            assertTrue(owner.progressText().contains("Taking longer than usual"));
            assertTrue(owner.progressDetails().contains("package-manager-update.log"));
            assertTrue(owner.progressDetails().contains("other actions remain blocked"));
            assertFalse(owner.start(() -> new OperationCoordinator.Completion(true, "wrong")));
            assertNull(owner.takeCompletion());
        } finally {
            Files.write(marker.toPath(), "0\n".getBytes(StandardCharsets.UTF_8));
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (owner.isRunning() && System.nanoTime() < deadline) Thread.sleep(10);
            marker.delete();
        }
        assertFalse(owner.isRunning());
        assertTrue(owner.takeCompletion().success);
    }
    @Test public void normalProgressAlsoExplainsKeepingUsbConnected() throws Exception {
        OperationCoordinator owner = new OperationCoordinator(Long.MAX_VALUE);
        CountDownLatch release = new CountDownLatch(1);
        assertTrue(owner.start("Installing Example", () -> { release.await(); return new OperationCoordinator.Completion(true, "done"); }));
        try {
            assertTrue(owner.progressText().contains("Keep USB connected"));
            assertFalse(owner.progressText().contains("Taking longer than usual"));
        } finally { release.countDown(); }
    }
}
