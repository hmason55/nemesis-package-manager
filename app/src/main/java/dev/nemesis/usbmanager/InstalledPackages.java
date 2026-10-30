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
    final Map<String, String> versions = new HashMap<String, String>();
    final Set<String> savedVersions = new HashSet<String>();
    final String error;
    private InstalledPackages(String error) { this.error = error; }
    boolean available() { return error == null; }

    String versionQuery() {
        // NEMESIS root -c truncates commands at 1024 bytes. Keep this independent
        // of the number of installed packages; readVersions trusts registry IDs only.
        return "for meta in /data/nemesis/apps/*/NEMESIS.data; do " +
            "[ -r \"$meta\" ] || continue; id=${meta%/NEMESIS.data}; id=${id##*/}; " +
            "printf '\\n[installed:%s]\\n' \"$id\"; cat \"$meta\"; done; true";
    }

    void readVersions(int rc, String output) {
        if (rc != 0 || output == null) return;
        String id = null;
        boolean metadata = false;
        for (String raw : output.split("\n")) {
            String line = raw.replace("\uFEFF", "").trim();
            if (line.startsWith("[installed:") && line.endsWith("]")) {
                id = line.substring(11, line.length() - 1); metadata = false;
            } else if (line.startsWith("[")) {
                metadata = "[nemesis]".equalsIgnoreCase(line.replace("\uFEFF", ""));
            } else if (metadata && id != null && names.containsKey(id)) {
                int equals = line.indexOf('=');
                if (equals > 0 && line.substring(equals + 1).trim().length() > 0 && "version".equalsIgnoreCase(line.substring(0, equals).trim()))
                    versions.put(id, line.substring(equals + 1).trim());
            }
        }
    }

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
