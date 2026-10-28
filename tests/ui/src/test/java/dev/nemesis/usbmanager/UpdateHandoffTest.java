package dev.nemesis.usbmanager;

import java.io.File;
import java.nio.file.Files;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.Test;
import static org.junit.Assert.*;

public class UpdateHandoffTest {
    @Test public void handoffRetainsOwnershipAcrossReopeningUntilSuccessOrFailure() throws Exception {
        for (final int exitCode : new int[] {0, 7}) {
            final File marker = Files.createTempFile("manager-update-", ".result").toFile();
            final OperationCoordinator owner = new OperationCoordinator();
            final CountDownLatch handedOff = new CountDownLatch(1);
            assertTrue(owner.start("Update Package Manager", new OperationCoordinator.Task() {
                public OperationCoordinator.Completion run() throws Exception {
                    handedOff.countDown();
                    int result = UpdateHandoff.awaitResult(marker);
                    return new OperationCoordinator.Completion(result == 0, "Exit: " + result);
                }
            }));
            assertTrue(handedOff.await(5, TimeUnit.SECONDS));
            // No activity owns this flag; a reopened activity sees the same owner.
            assertTrue(owner.isRunning());
            assertNull(owner.takeCompletion());
            assertFalse(owner.start(new OperationCoordinator.Task() {
                public OperationCoordinator.Completion run() { throw new AssertionError("Competing install ran"); }
            }));
            Files.write(marker.toPath(), (exitCode + "\n").getBytes(StandardCharsets.UTF_8));
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
            while (owner.isRunning() && System.nanoTime() < deadline) Thread.sleep(10);
            assertFalse(owner.isRunning());
            OperationCoordinator.Completion completed = owner.takeCompletion();
            assertNotNull(completed);
            assertEquals(exitCode == 0, completed.success);
            assertTrue(owner.start(new OperationCoordinator.Task() {
                public OperationCoordinator.Completion run() { return new OperationCoordinator.Completion(true, "Next operation"); }
            }));
            marker.delete();
        }
    }
}
