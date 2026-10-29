package dev.nemesis.usbmanager;

import java.io.File;
import org.junit.Test;
import static org.junit.Assert.*;

public class PresentationEdgeCasesTest {
    @Test public void confirmationsExplainTheSelectedActionAndUncertainVersions() {
        PackageScanner.Item item = new PackageScanner.Item();
        item.kind = PackageScanner.EXECUTE;
        String script = PackagePresentation.confirmation(item);
        assertTrue(script.contains("Run this script"));
        assertFalse("Running a script makes no data preservation promise", script.contains("kept"));
        item.kind = PackageScanner.INSTALL;
        assertTrue(PackagePresentation.confirmation(item).contains("Keep USB connected"));
        item.installed = true; item.version = "1.2"; item.installedVersion = "1.1";
        String update = PackagePresentation.confirmation(item);
        assertTrue(update.contains("Installed: 1.1\nOn USB: 1.2"));
        assertFalse(update.contains("could not be compared"));
        item.installedVersion = "custom";
        assertTrue(PackagePresentation.confirmation(item).contains("could not be compared"));
        item.id = "usb.package.manager";
        assertFalse(PackagePresentation.canInstall(item));
    }
    @Test public void namesStatesAndSelectionKeysHaveUsefulFallbacks() {
        PackageScanner.Item item = new PackageScanner.Item();
        assertEquals("Unnamed package", PackagePresentation.name(item));
        item.id = "";
        item.version = "";
        assertEquals("Unnamed package", PackagePresentation.name(item));
        assertFalse(PackagePresentation.details(item).contains("Package ID:"));
        assertFalse(PackagePresentation.details(item).contains("USB version:"));
        item.id = null;
        assertFalse(PackagePresentation.details(item).contains("Package ID:"));
        assertFalse(item.label().contains("INSTALLED"));
        item.id = "demo.app";
        assertEquals("demo.app", PackagePresentation.name(item));
        item.title = "  ";
        assertEquals("demo.app", PackagePresentation.name(item));
        item.title = " Demo ";
        assertEquals("Demo", PackagePresentation.name(item));
        assertEquals("installed:demo.app", PackagePresentation.key(item));
        item.folder = new File("source");
        assertEquals(item.folder.getAbsolutePath(), PackagePresentation.key(item));
        item.customDataDir = new File("custom-data");
        assertEquals(item.customDataDir, item.dataDir());
        assertTrue(PackagePresentation.details(item).contains(item.customDataDir.getAbsolutePath()));
        item.locked = true;
        assertTrue(PackagePresentation.state(item).contains("Locked"));
        item.locked = false;
        item.kind = PackageScanner.EXECUTE;
        assertEquals("Script", PackagePresentation.state(item));
        assertEquals("execute", PackagePresentation.operation(item, null));
        item.kind = PackageScanner.INSTALL;
        assertEquals("install", PackagePresentation.operation(item, null));
        item.installed = true;
        assertEquals("update", PackagePresentation.operation(item, null));
        assertEquals("uninstall", PackagePresentation.operation(item, "uninstall"));
        item.id = "usb.package.manager";
        assertTrue(PackagePresentation.details(item).contains("NEMESIS Manager > Packages"));
        item.error = "Missing installer";
        assertTrue(PackagePresentation.details(item).contains("Problem: Missing installer"));
        assertFalse(PackagePresentation.isManager(null));
        assertFalse(PackagePresentation.canUninstall(null));
        assertEquals("Install", PackagePresentation.action(null));
        item.kind = "installed";
        assertEquals("Install", PackagePresentation.action(item));
    }

    @Test public void launchAndRemovalRequireKnownValidInstalledState() {
        PackageScanner.Item item = new PackageScanner.Item();
        item.id = "demo.app";
        assertFalse(PackagePresentation.canLaunch(item));
        assertFalse(PackagePresentation.canUninstall(item));
        item.installed = true;
        for (String types : new String[] {null, "", "  ", "application", "service,application"}) {
            item.types = types;
            assertTrue(PackagePresentation.canLaunch(item));
        }
        item.types = " SERVICE , service ";
        assertFalse(PackagePresentation.canLaunch(item));
        item.id = "bad..id";
        assertFalse(PackagePresentation.canLaunch(item));
        assertFalse(PackagePresentation.canUninstall(item));
        item.id = "demo.app";
        item.installedStateKnown = false;
        assertFalse(PackagePresentation.canUninstall(item));
    }

    @Test public void blankResultsStayReadableAndFailedOperationsKeepDiagnostics() {
        for (boolean success : new boolean[] {false, true}) {
            for (String output : new String[] {null, "", " \n "}) {
                OperationCoordinator.Completion result = new OperationCoordinator.Completion(success, output);
                assertEquals(success, result.success);
                assertTrue(result.output.contains(success ? "completed successfully" : "failed"));
            }
        }
        PackageScanner.Item item = new PackageScanner.Item();
        item.id = "demo.app";
        for (String operation : new String[] {"uninstall", "pkg-launch", "execute", "update", "install"}) {
            OperationCoordinator.Completion result = PackagePresentation.completion(item, operation, 9, " permission denied \n");
            assertFalse(result.success);
            assertTrue(result.output.contains("failed for demo.app"));
            assertTrue(result.details.endsWith("permission denied"));
            assertTrue(result.details.contains("Exit code: 9"));
        }
        InstalledPackages empty = InstalledPackages.parse(0, null);
        assertTrue(empty.available());
        assertTrue(empty.names.isEmpty());
        for (String detail : new String[] {null, "", " \n "}) {
            assertTrue(InstalledPackages.parse(3, detail).error.contains("failed (3)\nTap Refresh"));
        }
        InstalledPackages parsed = InstalledPackages.parse(0, "bad..id|Bad|0\ndemo.app||0\n");
        assertEquals(1, parsed.names.size());
        assertEquals("demo.app", parsed.names.get("demo.app"));
        assertEquals("", parsed.types.get("demo.app"));
    }
}
