package dev.nemesis.usbmanager;

import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

/** A failed registry query is unknown state, never an empty successful registry. */
final class InstalledPackages {
    final Map<String, String> names = new HashMap<String, String>();
    final Set<String> locked = new HashSet<String>();
    final Map<String, String> types = new HashMap<String, String>();
    final String error;
    private InstalledPackages(String error) { this.error = error; }
    boolean available() { return error == null; }

    static InstalledPackages parse(int rc, String output) {
        if (rc != 0) {
            String detail = output == null ? "" : output.trim();
            return new InstalledPackages("Installed state unavailable: nemesis pkg-list failed (" + rc + ")" +
                (detail.length() == 0 ? "" : "\n" + detail) + "\nTap Refresh to retry.");
        }
        InstalledPackages result = new InstalledPackages(null);
        for (String line : (output == null ? "" : output).split("\n")) {
            String[] fields = line.trim().split("\\|", -1);
            if (fields.length >= 3 && PackageScanner.validId(fields[0])) {
                result.names.put(fields[0], fields[1].length() == 0 ? fields[0] : fields[1]);
                result.types.put(fields[0], fields.length > 3 ? fields[3] : "");
                if ("1".equals(fields[2])) result.locked.add(fields[0]);
            }
        }
        return result;
    }
}
