package dev.nemesis.usbmanager;

import java.io.File;

/** Plain text shared by the package list, details, and operation results. */
final class PackagePresentation {
    static final int INSTALLED = 0;
    static final int UPDATES = 1;
    static final int NOT_INSTALLED = 2;
    static final int SCRIPTS = 3;
    private PackagePresentation() { }
    // Only order numeric releases and the manager's numeric build suffix.
    // Authors use arbitrary version strings; unknown ordering must stay explicit.
    static Integer compareVersions(String candidate, String installed) {
        if (candidate == null || installed == null || candidate.trim().length() == 0 || installed.trim().length() == 0) return null;
        candidate = candidate.trim(); installed = installed.trim();
        if (candidate.equals(installed)) return 0;
        if (!candidate.matches("[0-9]+(\\.[0-9]+)*(-build\\.[0-9]+)?") ||
            !installed.matches("[0-9]+(\\.[0-9]+)*(-build\\.[0-9]+)?")) return null;
        String[] a = candidate.replace("-build.", ".").split("\\.");
        String[] b = installed.replace("-build.", ".").split("\\.");
        for (int i = 0; i < Math.max(a.length, b.length); i++) {
            java.math.BigInteger x = new java.math.BigInteger(i < a.length ? a[i] : "0");
            java.math.BigInteger y = new java.math.BigInteger(i < b.length ? b[i] : "0");
            int difference = x.compareTo(y);
            if (difference != 0) return difference;
        }
        return 0;
    }
    static boolean updateAvailable(PackageScanner.Item item) {
        Integer comparison = compareVersions(item.version, item.installedVersion);
        return item.installedStateKnown && item.installed && !item.locked &&
            !PackageScanner.EXECUTE.equals(item.kind) && !PackageScanner.BROKEN.equals(item.kind) &&
            !"installed".equals(item.kind) && comparison != null && comparison > 0;
    }
    static boolean canInstall(PackageScanner.Item item) {
        if (item == null || item.locked || PackageScanner.BROKEN.equals(item.kind) || "installed".equals(item.kind)) return false;
        if (PackageScanner.EXECUTE.equals(item.kind)) return true;
        if (!item.installedStateKnown || (isManager(item) && !item.installed)) return false;
        Integer comparison = compareVersions(item.version, item.installedVersion);
        return !item.installed || comparison == null || comparison > 0;
    }
    static boolean inCategory(PackageScanner.Item item, int category) {
        if (category == SCRIPTS) return PackageScanner.EXECUTE.equals(item.kind);
        if (PackageScanner.EXECUTE.equals(item.kind)) return false;
        if (category == NOT_INSTALLED) return item.installedStateKnown && !item.installed;
        if (category == UPDATES) return updateAvailable(item);
        return category == INSTALLED && item.installedStateKnown && item.installed;
    }
    static String installedVersion(PackageScanner.Item item) {
        if (PackageScanner.EXECUTE.equals(item.kind)) return "N/A";
        if (!item.installedStateKnown) return "Unknown";
        if (!item.installed) return "Not installed";
        return versionText(item.installedVersion);
    }
    static String usbVersion(PackageScanner.Item item) {
        return "installed".equals(item.kind) ? "No installer" : versionText(item.version);
    }
    static String versionColumn(PackageScanner.Item item, int category) {
        if (category == UPDATES)
            return formattedVersion(item.installedVersion) + " \u2192 " + formattedVersion(item.version);
        if (category == INSTALLED)
            return item.installedStateKnown && item.installed ? formattedVersion(item.installedVersion) : installedVersion(item);
        return "installed".equals(item.kind) ? usbVersion(item) : formattedVersion(item.version);
    }
    private static String formattedVersion(String version) {
        String value = versionText(version);
        if ("Unknown".equals(value) || value.startsWith("v") || value.startsWith("V")) return value;
        return "v" + value;
    }
    private static String versionText(String version) {
        return version == null || version.trim().length() == 0 ? "Unknown" : version.trim();
    }
    static boolean isManager(PackageScanner.Item item) {
        return item != null && "usb.package.manager".equals(item.id);
    }
    static boolean canUninstall(PackageScanner.Item item) {
        return item != null && item.installedStateKnown && item.installed &&
            !item.locked && PackageScanner.validId(item.id) && !isManager(item);
    }
    static String name(PackageScanner.Item item) {
        if (item.title != null && item.title.trim().length() > 0) return item.title.trim();
        if (item.id != null && item.id.length() > 0) return item.id;
        return "Unnamed package";
    }
    static String state(PackageScanner.Item item) {
        if (!item.installedStateKnown) return "Installed state unavailable";
        if (PackageScanner.EXECUTE.equals(item.kind)) return "Script";
        if (item.locked) return "Installed | Locked";
        if (updateAvailable(item)) return "Update available";
        if (item.installed) return "Installed";
        return PackageScanner.EXECUTE.equals(item.kind) ? "Script" : "Not installed";
    }
    static String subtitle(PackageScanner.Item item) {
        if (PackageScanner.BROKEN.equals(item.kind)) return "Invalid installer";
        String state = state(item);
        if (item.installed && !PackageScanner.EXECUTE.equals(item.kind))
            state += " | Installed " + (item.installedVersion == null || item.installedVersion.length() == 0 ? "version unknown" : item.installedVersion);
        if (item.version != null && item.version.length() > 0) state += " | USB " + item.version;
        return state;
    }
    static String action(PackageScanner.Item item) {
        if (item == null || "installed".equals(item.kind)) return "Install";
        if (PackageScanner.EXECUTE.equals(item.kind)) return "Run script";
        if (!item.installed) return "Install";
        Integer comparison = compareVersions(item.version, item.installedVersion);
        if (comparison == null) return "Install version";
        return comparison == 0 ? "Up to date" : comparison > 0 ? "Update" : "Older installer";
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
    static String confirmation(PackageScanner.Item item) {
        if (PackageScanner.EXECUTE.equals(item.kind))
            return "Run this script on the head unit. Only use scripts you trust; they can change the system.";
        String text = "Only install releases you trust that support your vehicle.";
        if (item.installed) {
            text += "\n\nInstalled: " + versionText(item.installedVersion) + "\nOn USB: " + versionText(item.version);
            if (compareVersions(item.version, item.installedVersion) == null)
                text += "\nThese versions could not be compared. Check that this is the release you want.";
        }
        return text + (isManager(item) ? "\n\nPackage Manager will close and reopen during the update." :
            "\n\nKeep USB connected until it finishes.");
    }
    static String key(PackageScanner.Item item) {
        // Keep separate release installers selectable even when they share an ID.
        return item.target != null ? item.target.getAbsolutePath() :
            (item.folder != null ? item.folder.getAbsolutePath() : "installed:" + item.id);
    }
    static String details(PackageScanner.Item item) {
        StringBuilder text = new StringBuilder(state(item));
        if (isManager(item)) text.append("\n\nUse Update to install the version on USB. To remove Package Manager, use NEMESIS Manager > Packages.");
        if (item.id != null && item.id.length() > 0) text.append("\nPackage ID: ").append(item.id);
        if (item.version != null && item.version.length() > 0) text.append("\nUSB version: ").append(item.version);
        if (item.installed) text.append("\nInstalled version: ").append(item.installedVersion == null ? "Unknown" : item.installedVersion);
        if (item.installed && compareVersions(item.version, item.installedVersion) == null)
            text.append("\nVersions could not be compared. Install version uses the release on USB; check its instructions first.");
        if (item.error != null) text.append("\n\nProblem: ").append(item.error);
        if (item.target != null) text.append("\n\nUSB source:\n").append(item.target.getAbsolutePath());
        else if (item.folder != null) text.append("\n\nUSB folder:\n").append(item.folder.getAbsolutePath());
        else text.append("\n\nInstalled on the head unit. Add a compatible USB installer to update it.");
        File data = item.dataDir();
        if (data != null) text.append("\n\nData and history:\n").append(data.getAbsolutePath())
            .append("\nHistory file: package-manager-history.log");
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
        String summary = success ? name(item) + " was " + verb + "." :
            title + " failed for " + name(item) + ".\n\nOpen Details for the error. Check the package instructions before trying again.";
        if (success && "uninstall".equals(operation)) summary += "\n\nIts USB installer and data folder were kept.";
        else if (success && ("install".equals(operation) || "update".equals(operation)))
            summary += "\n\nFind it in Installed.";
        String raw = output == null || output.trim().length() == 0 ? "NEMESIS returned no additional output." : output.trim();
        String details = "Package: " + name(item) + "\nOperation: " + operation + "\nExit code: " + rc + "\n\n" + raw;
        return new OperationCoordinator.Completion(success, title + (success ? " complete" : " failed"), summary, details);
    }
}
