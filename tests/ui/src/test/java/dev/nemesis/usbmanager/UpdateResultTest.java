package dev.nemesis.usbmanager;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import static org.junit.Assert.*;

public class UpdateResultTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();

    @Test public void missingMalformedAndUnreadableMarkersKeepOwnershipUntilValidResult() throws Exception {
        for (String initial : new String[] {null, "", "oops", "1000", "-1"}) {
            File marker = new File(temporary.newFolder(), "result");
            if (initial != null) Files.write(marker.toPath(), initial.getBytes(StandardCharsets.UTF_8));
            CountDownLatch retried = new CountDownLatch(1);
            AtomicInteger attempts = new AtomicInteger();
            // Claim a missing marker is present to exercise a transient open failure.
            File observed = new File(marker.getPath()) {
                @Override public boolean isFile() {
                    if (attempts.incrementAndGet() >= 3) retried.countDown();
                    return initial == null || super.isFile();
                }
            };
            AtomicReference<Integer> result = new AtomicReference<Integer>();
            AtomicReference<Throwable> failure = new AtomicReference<Throwable>();
            AtomicReference<Boolean> interrupted = new AtomicReference<Boolean>();
            Thread worker = new Thread(() -> {
                Thread.currentThread().interrupt();
                try {
                    result.set(UpdateHandoff.awaitResult(observed));
                    interrupted.set(Thread.currentThread().isInterrupted());
                } catch (Throwable error) { failure.set(error); }
            });
            worker.setDaemon(true);
            worker.start();
            try {
                assertTrue("Marker was not retried", retried.await(5, TimeUnit.SECONDS));
                assertNull("Invalid marker completed the operation", result.get());
            } finally {
                Files.write(marker.toPath(), "7\n".getBytes(StandardCharsets.UTF_8));
                worker.join(5000);
            }
            assertFalse("Update worker did not finish", worker.isAlive());
            assertNull(failure.get());
            assertEquals(Integer.valueOf(7), result.get());
            assertEquals(Boolean.TRUE, interrupted.get());
        }
    }
}
