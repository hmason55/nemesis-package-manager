package dev.nemesis.usbmanager;

/** Process-wide owner of package work; activities only observe its state. */
final class OperationCoordinator {
    interface Task { Completion run() throws Exception; }
    static final class Completion {
        final boolean success;
        final String output;
        Completion(boolean success, String output) { this.success = success; this.output = output; }
    }
    private boolean running;
    private Completion completion;

    synchronized boolean isRunning() { return running; }
    synchronized Completion takeCompletion() {
        Completion result = completion;
        completion = null;
        return result;
    }
    synchronized boolean start(final Task task) {
        // Keep an unreported completion until a resumed activity consumes it.
        if (running || completion != null) return false;
        running = true;
        try {
            new Thread(new Runnable() {
                public void run() {
                    Completion result;
                    try { result = task.run(); }
                    catch (Exception e) { result = new Completion(false, e.toString()); }
                    synchronized (OperationCoordinator.this) {
                        completion = result;
                        running = false;
                    }
                }
            }, "nemesis-package-operation").start();
        } catch (RuntimeException e) {
            running = false;
            throw e;
        }
        return true;
    }
}
