package dev.nemesis.usbmanager;

/** Process-wide owner of package work; activities only observe its state. */
final class OperationCoordinator {
    interface Task { Completion run() throws Exception; }
    static final class Completion {
        final boolean success;
        final String output;
        final String title;
        final String details;
        Completion(boolean success, String output) {
            this(success, success ? "Completed" : "Operation failed", output, output);
        }
        Completion(boolean success, String title, String output, String details) {
            this.success = success;
            this.title = title;
            this.output = output == null || output.trim().length() == 0 ?
                (success ? "The operation completed successfully." : "The operation failed. Check NEMESIS logs before retrying.") : output;
            this.details = details;
        }
    }
    private final long warningAfterMillis;
    private long startedAt;
    OperationCoordinator() { this(60000); }
    OperationCoordinator(long warningAfterMillis) { this.warningAfterMillis = warningAfterMillis; }
    private boolean running;
    private Completion completion;
    private String description = "Package operation";

    synchronized boolean isRunning() { return running; }
    synchronized String description() { return description; }
    synchronized String progressText() {
        long elapsed = Math.max(0, (System.nanoTime() - startedAt) / 1000000);
        return description + " | " + elapsed / 1000 + "s" +
            (elapsed >= warningAfterMillis ? " | Taking longer than usual. Open Details for guidance." : " | Keep USB connected.");
    }
    synchronized String progressDetails() {
        return progressText() + "\n\nKeep USB connected. A slow operation may still be running; other actions remain blocked until its result is known." +
            "\nDo not start another action in NEMESIS Manager. You can close and reopen this screen to continue monitoring." +
            "\n\nFor a manager update, inspect /data/nemesis/logs/package-manager-update.log. If progress has stopped, get help with the NEMESIS logs before retrying; restarting or removing power during installation can interrupt system changes.";
    }
    synchronized Completion takeCompletion() {
        Completion result = completion;
        completion = null;
        return result;
    }
    synchronized boolean start(final Task task) {
        return start("Package operation", task);
    }
    synchronized boolean start(String description, final Task task) {
        // Keep an unreported completion until a resumed activity consumes it.
        if (running || completion != null) return false;
        running = true;
        startedAt = System.nanoTime();
        this.description = description;
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
