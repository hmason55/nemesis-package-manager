package dev.nemesis.usbmanager;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.InputStreamReader;
import java.io.IOException;

/** Wait in the process-wide worker, never in an activity or on the UI thread. */
final class UpdateHandoff {
    private UpdateHandoff() { }
    static int awaitResult(File marker) throws IOException, InterruptedException {
        boolean interrupted = false;
        while (true) {
            try {
              if (marker.isFile()) {
                BufferedReader reader = new BufferedReader(new InputStreamReader(new FileInputStream(marker), "UTF-8"));
                try {
                    String value = reader.readLine();
                    if (value != null && value.matches("[0-9]{1,3}")) {
                        if (interrupted) Thread.currentThread().interrupt();
                        return Integer.parseInt(value);
                    }
                } finally { reader.close(); }
              }
            } catch (IOException error) {
                // A transient read error is not evidence that the installer finished.
            }
            // A slow installer must not be mistaken for a finished operation.
            try { Thread.sleep(250); }
            catch (InterruptedException error) { interrupted = true; }
        }
    }
}
