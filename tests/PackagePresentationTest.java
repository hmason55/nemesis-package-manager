package dev.nemesis.usbmanager;

import java.io.File;

public final class PackagePresentationTest {
    static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
    public static void main(String[] args) {
        PackageScanner.Item manager = new PackageScanner.Item();
        manager.id = "usb.package.manager"; manager.installed = true;
        manager.kind = PackageScanner.INSTALL; manager.version = "2"; manager.installedVersion = "1";
        check(PackagePresentation.isManager(manager), "manager is recognized by stable ID");
        check(!PackagePresentation.canUninstall(manager), "manager cannot remove itself");
        check(!PackagePresentation.canInstall(manager) && !PackagePresentation.canLaunch(manager), "manager cannot manage itself");
        for (int category = 0; category < 4; category++)
            check(!PackagePresentation.inCategory(manager, category), "manager is excluded from every tab and count");
        check(!PackagePresentation.updateAvailable(manager), "manager does not advertise self updates");
        manager.id = "other.package";
        check(PackagePresentation.canUninstall(manager), "other installed packages remain removable");
        manager.locked = true;
        check(!PackagePresentation.canUninstall(manager), "locked packages remain protected");
        PackageScanner.Item item = new PackageScanner.Item();
        item.title = "Example App"; item.id = "example.app"; item.kind = PackageScanner.INSTALL;
        item.target = new File("/storage/usb0/packages/ExampleApp/packages/example.app.zip");
        item.folder = item.target.getParentFile(); item.version = "1.2";
        String[] operations = { "install", "update", "uninstall", "pkg-launch", "execute" };
        String[] verbs = { "installed", "updated", "uninstalled", "launched", "run" };
        for (int i = 0; i < operations.length; i++) {
            OperationCoordinator.Completion result = PackagePresentation.completion(item, operations[i], 0, "");
            check(result.success && result.output.contains("Example App was " + verbs[i] + "."), operations[i] + " has useful summary with empty stdout");
            check(result.details.contains("Exit code: 0") && result.details.contains("no additional output"), "empty output has explicit details");
        }
        OperationCoordinator.Completion failure = PackagePresentation.completion(item, "install", 7, "firmware mismatch");
        check(!failure.success && failure.output.contains("failed for Example App") && failure.details.contains("firmware mismatch"), "failure retains error and package identity");
        check(failure.details.contains("Exit code: 7"), "exit code is available");
        check(PackagePresentation.completion(item, "uninstall", 0, null).output.contains("data folder were kept"), "uninstall explains USB data retention");
        check("Install".equals(PackagePresentation.action(item)), "new package action");
        item.installed = true;
        check("Install version".equals(PackagePresentation.action(item)), "missing installed version does not claim update");
        item.installedVersion = "1.1";
        check("1.1".equals(PackagePresentation.versionColumn(item, PackagePresentation.INSTALLED)), "Installed shows only installed version");
        check("1.1 \u2192 1.2".equals(PackagePresentation.versionColumn(item, PackagePresentation.UPDATES)), "Updates compares installed and USB versions in one column");
        check("1.2".equals(PackagePresentation.versionColumn(item, PackagePresentation.NOT_INSTALLED)), "Not Installed shows only USB version");
        check("1.2".equals(PackagePresentation.versionColumn(item, PackagePresentation.SCRIPTS)), "Scripts shows only USB version");
        check("Update".equals(PackagePresentation.action(item)), "installed package action");
        check(PackagePresentation.updateAvailable(item) && PackagePresentation.inCategory(item, PackagePresentation.UPDATES), "newer release is in Updates");
        check(PackagePresentation.inCategory(item, PackagePresentation.INSTALLED) && !PackagePresentation.inCategory(item, PackagePresentation.NOT_INSTALLED), "newer USB release appears in Installed and Updates but never Not installed");
        item.installedVersion = "1.2";
        check("Up to date".equals(PackagePresentation.action(item)) && !PackagePresentation.canInstall(item), "identical installer is disabled");
        check(!PackagePresentation.inCategory(item, PackagePresentation.UPDATES) && PackagePresentation.inCategory(item, PackagePresentation.INSTALLED), "identical release belongs in Installed");
        check("1.2".equals(PackagePresentation.installedVersion(item)) && "1.2".equals(PackagePresentation.usbVersion(item)), "installed and USB columns show their respective versions");
        item.installed = false;
        check(PackagePresentation.inCategory(item, PackagePresentation.NOT_INSTALLED) && !PackagePresentation.inCategory(item, PackagePresentation.INSTALLED) && !PackagePresentation.inCategory(item, PackagePresentation.UPDATES), "new package belongs only in Not installed");
        check("Not installed".equals(PackagePresentation.installedVersion(item)), "new package does not claim an installed version");
        item.installed = true;
        item.installedVersion = "1.10";
        check("Older installer".equals(PackagePresentation.action(item)) && !PackagePresentation.canInstall(item), "numeric versions do not sort lexically");
        check(PackagePresentation.compareVersions("0.2.0-build.42", "0.2.0-build.9") > 0, "manager builds sort numerically");
        check(PackagePresentation.compareVersions("32.68-gen5w.5", "32.68-gen5w.5") == 0, "identical custom releases detected");
        check(PackagePresentation.compareVersions("1.0-beta", "1.0") == null, "custom ordering stays unknown");
        check(PackagePresentation.compareVersions("1.2.0", "1.2") == 0, "zero padding remains equal");
        check(PackagePresentation.compareVersions("v1.3", "V1.2") > 0, "version prefixes do not hide numeric updates");
        check(!PackagePresentation.subtitle(item).contains("Â"), "status text contains no mojibake");
        check(!PackagePresentation.subtitle(item).contains("/storage") && !PackagePresentation.subtitle(item).contains("Example App"), "list does not repeat name or path");
        check(PackagePresentation.details(item).contains(item.target.getAbsolutePath()) && PackagePresentation.details(item).contains("USB version: 1.2"), "full source and version remain in Details");
        String firstKey = PackagePresentation.key(item);
        item.target = new File("/storage/usb0/packages/Other/example.app.zip");
        check(!firstKey.equals(PackagePresentation.key(item)), "release selection keys do not collapse equal IDs");
        item.types = "service";
        check(!PackagePresentation.canLaunch(item), "service-only package cannot be launched as an app");
        item.types = "application,service";
        check(PackagePresentation.canLaunch(item), "app and service package remains launchable");
        item.installedStateKnown = false;
        check(!PackagePresentation.canLaunch(item) && PackagePresentation.subtitle(item).contains("unavailable"), "unknown installed state is visible");
        item.kind = PackageScanner.BROKEN;
        check("Invalid installer".equals(PackagePresentation.subtitle(item)), "invalid installer has concise status");
        item.target = null;
        check(PackagePresentation.details(item).contains("USB folder:") && !PackagePresentation.details(item).contains("Installed on the head unit"), "invalid descriptor does not claim it is installed");
        item.kind = PackageScanner.EXECUTE;
        check("Run script".equals(PackagePresentation.action(item)), "script action");
        check(PackagePresentation.inCategory(item, PackagePresentation.SCRIPTS) && !PackagePresentation.inCategory(item, PackagePresentation.INSTALLED), "scripts have a separate category");
        check("N/A".equals(PackagePresentation.installedVersion(item)), "scripts do not claim an installed version");
        item.version = "v2.0";
        check("2.0".equals(PackagePresentation.versionColumn(item, PackagePresentation.SCRIPTS)), "numeric version prefix is omitted");
        item.version = null;
        check("Unknown".equals(PackagePresentation.versionColumn(item, PackagePresentation.SCRIPTS)), "missing versions remain explicit");
        item.kind = "installed"; item.folder = null; item.target = null;
        check(PackagePresentation.details(item).contains("head unit"), "installed-only details tolerate missing USB folder");
        check(new OperationCoordinator.Completion(true, "").output.length() > 0, "generic result cannot be blank");
        System.out.println("PackagePresentation: all checks passed");
    }
}
