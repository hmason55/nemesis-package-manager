package dev.nemesis.usbmanager;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

public final class OperationCoordinatorTest {
    private static void check(boolean value, String message) {
        if (!value) throw new AssertionError(message);
    }
    private static void awaitIdle(OperationCoordinator owner) throws Exception {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
        while (owner.isRunning() && System.nanoTime() < deadline) Thread.sleep(5);
        check(!owner.isRunning(), "operation did not finish");
    }
    public static void main(String[] args) throws Exception {
        final OperationCoordinator owner = new OperationCoordinator();
        final CountDownLatch entered = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        OperationCoordinator.Task first = new OperationCoordinator.Task() {
            public OperationCoordinator.Completion run() throws Exception {
                entered.countDown();
                if (!release.await(5, TimeUnit.SECONDS)) throw new Exception("test timed out");
                return new OperationCoordinator.Completion(true, "installed");
            }
        };
        OperationCoordinator.Task failure = new OperationCoordinator.Task() {
            public OperationCoordinator.Completion run() { throw new IllegalStateException("failure"); }
        };
        check(owner.start(first), "first activity can start work");
        check(entered.await(5, TimeUnit.SECONDS), "worker started");
        // A reopened activity uses the same owner, without the first activity's busy flag.
        check(owner.isRunning(), "reopened activity observes running work");
        check(!owner.start(failure), "second operation must be rejected");
        release.countDown();
        awaitIdle(owner);
        check(!owner.start(failure), "unreported result must survive time with no activity");
        OperationCoordinator.Completion completed = owner.takeCompletion();
        check(completed.success && "installed".equals(completed.output), "result survives reopening");
        check(owner.takeCompletion() == null, "result is delivered once");
        check(owner.start(failure), "next operation allowed after result delivery");
        awaitIdle(owner);
        completed = owner.takeCompletion();
        check(!completed.success && completed.output.contains("failure"), "failure releases ownership and is visible");
        System.out.println("OperationCoordinator: all checks passed");
    }
}
