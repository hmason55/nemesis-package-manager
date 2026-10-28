package dev.nemesis.usbmanager;

import java.io.File;

/** Plain text shared by the package list, details, and operation results. */
final class PackagePresentation {
    private PackagePresentation() { }
    static String name(PackageScanner.Item item) {
        if (item.title != null && item.title.trim().length() > 0) return item.title.trim();
        if (item.id != null && item.id.length() > 0) return item.id;
        return "Unnamed package";
    }
    static String state(PackageScanner.Item item) {
        if (!item.installedStateKnown) return "Installed state unavailable";
        if (item.locked) return "Installed · Locked";
        if (item.installed) return "Installed";
        return PackageScanner.EXECUTE.equals(item.kind) ? "USB script" : "Not installed";
    }
    static String subtitle(PackageScanner.Item item) {
        if (PackageScanner.BROKEN.equals(item.kind)) return "Invalid installer · Tap Details";
        String state = state(item);
        if (item.version != null && item.version.length() > 0) state += " · USB " + item.version;
        if ("installed".equals(item.kind)) return state + " · No USB installer";
        if (item.installedStateKnown && item.installed && !item.locked && !PackageScanner.EXECUTE.equals(item.kind))
            return state + " · USB installer available";
        return state;
    }
    static String action(PackageScanner.Item item) {
        if (item == null || "installed".equals(item.kind)) return "Install";
        if (PackageScanner.EXECUTE.equals(item.kind)) return "Run script";
        return item.installed ? "Update" : "Install";
    }
    static boolean canLaunch(PackageScanner.Item item) {
        if (!item.installedStateKnown || !item.installed || !PackageScanner.validId(item.id)) return false;
        // Missing metadata remains launchable; an explicit service-only package does not.
        if (item.types == null || item.types.trim().length() == 0) return true;
        for (String type : item.types.split(",")) if (!"service".equalsIgnoreCase(type.trim())) return true;
        return false;
    }
    static String operation(PackageScanner.Item item, String command) {
        if (command != null) return command;
        if (PackageScanner.EXECUTE.equals(item.kind)) return "execute";
        return item.installed ? "update" : "install";
    }
    static String key(PackageScanner.Item item) {
        // Keep separate release installers selectable even when they share an ID.
        return item.target != null ? item.target.getAbsolutePath() :
            (item.folder != null ? item.folder.getAbsolutePath() : "installed:" + item.id);
    }
    static String details(PackageScanner.Item item) {
        StringBuilder text = new StringBuilder(state(item));
        if (item.id != null && item.id.length() > 0) text.append("\nPackage ID: ").append(item.id);
        if (item.version != null && item.version.length() > 0) text.append("\nUSB version: ").append(item.version);
        if (item.error != null) text.append("\n\nProblem: ").append(item.error);
        if (item.target != null) text.append("\n\nUSB source:\n").append(item.target.getAbsolutePath());
        else if (item.folder != null) text.append("\n\nUSB folder:\n").append(item.folder.getAbsolutePath());
        else text.append("\n\nInstalled on the head unit. Add a compatible USB installer to update it.");
        File data = item.dataDir();
        if (data != null) text.append("\n\nData and history:\n").append(data.getAbsolutePath())
            .append("\nHistory file: package-manager-history.log (when writing succeeds).")
            .append("\n\nOther apps keep their own output locations unless configured separately.");
        return text.toString();
    }
    static OperationCoordinator.Completion completion(PackageScanner.Item item, String operation, int rc, String output) {
        boolean success = rc == 0;
        String verb;
        String title;
        if ("uninstall".equals(operation)) { verb = "uninstalled"; title = "Uninstall"; }
        else if ("pkg-launch".equals(operation)) { verb = "launched"; title = "Launch"; }
        else if ("execute".equals(operation)) { verb = "run"; title = "Script"; }
        else if ("update".equals(operation)) { verb = "updated"; title = "Update"; }
        else { verb = "installed"; title = "Installation"; }
        String summary = success ? name(item) + " was " + verb + " successfully." :
            title + " failed for " + name(item) + ".\n\nOpen Details for the error, then check the package's instructions before retrying.";
        if (success && "uninstall".equals(operation)) summary += "\n\nIts USB installer and data folder were kept.";
        else if (success && ("install".equals(operation) || "update".equals(operation)))
            summary += "\n\nIt is now available in NEMESIS Manager's Packages list.";
        String raw = output == null || output.trim().length() == 0 ? "NEMESIS returned no additional output." : output.trim();
        String details = "Package: " + name(item) + "\nOperation: " + operation + "\nExit code: " + rc + "\n\n" + raw;
        return new OperationCoordinator.Completion(success, title + (success ? " complete" : " failed"), summary, details);
    }
}
