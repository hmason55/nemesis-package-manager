package dev.nemesis.usbmanager;

public final class InstalledPackagesTest {
    static void check(boolean value, String message) { if (!value) throw new AssertionError(message); }
    public static void main(String[] args) {
        InstalledPackages failed = InstalledPackages.parse(1, "nemesis: daemon not running\n");
        check(!failed.available(), "daemon failure is unknown registry state");
        check(failed.error.contains("daemon not running") && failed.error.contains("Refresh"), "error and retry are visible");
        check(failed.names.isEmpty(), "failed output is not trusted");
        check(!InstalledPackages.parse(2, "demo|Demo|1|application\n").names.containsKey("demo"), "nonzero status wins over output");
        InstalledPackages empty = InstalledPackages.parse(0, "");
        check(empty.available() && empty.names.isEmpty(), "successful empty registry remains valid");
        InstalledPackages recovered = InstalledPackages.parse(0, "demo|Demo|0|application\r\ncore|Core|1|service\n");
        check(recovered.available() && recovered.names.size() == 2, "refresh recovers registry");
        check(recovered.locked.contains("core") && !recovered.locked.contains("demo"), "lock state preserved");
        recovered.readVersions(0, "[installed:demo]\n[nemesis]\nversion = 1.2.3\n[launch]\nversion=wrong\n[installed:core]\n[nemesis]\nversion=2\n");
        check("1.2.3".equals(recovered.versions.get("demo")), "installed manifest version uses nemesis section only");
        check("2".equals(recovered.versions.get("core")), "multiple installed versions parsed");
        recovered.readVersions(1, "[installed:demo]\n[nemesis]\nversion=wrong\n");
        check("1.2.3".equals(recovered.versions.get("demo")), "failed metadata reads do not replace versions");
        check(recovered.versionQuery().contains("/data/nemesis/apps/demo/NEMESIS.data"), "reads NEMESIS installed metadata");
        PackageScanner.Item item = new PackageScanner.Item();
        item.title = "Demo"; item.kind = PackageScanner.INSTALL; item.installedStateKnown = failed.available();
        check(item.label().contains("INSTALLED STATE UNAVAILABLE"), "USB entry exposes unknown state");
        item.installedStateKnown = recovered.available(); item.installed = recovered.names.containsKey("demo");
        check(item.label().endsWith("INSTALLED"), "successful refresh restores installed label");
        System.out.println("InstalledPackages: all checks passed");
    }
}
