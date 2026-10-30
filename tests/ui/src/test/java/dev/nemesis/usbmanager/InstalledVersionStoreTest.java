package dev.nemesis.usbmanager;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import android.content.Context;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=19, manifest=Config.NONE)
public class InstalledVersionStoreTest {
    @Test public void savedVersionIsFallbackOnlyAndAbsentPackagesAreRemoved() {
        Context context = RuntimeEnvironment.getApplication();
        context.getSharedPreferences("installed-package-versions", 0).edit().clear().commit();
        InstalledVersionStore.record(context, "demo.app", "1.2", false);
        InstalledVersionStore.record(context, "invalid/id", "99", false);
        InstalledPackages registry = InstalledPackages.parse(0, "demo.app|Demo|0|application");
        InstalledVersionStore.apply(context, registry);
        assertEquals("1.2", registry.versions.get("demo.app"));
        assertTrue(registry.savedVersions.contains("demo.app"));
        PackageScanner.Item item = new PackageScanner.Item();
        item.id = "demo.app"; item.kind = "installed"; item.installed = true; item.installedStateKnown = true;
        item.installedVersion = registry.versions.get(item.id); item.installedVersionSaved = true;
        assertEquals("1.2", PackagePresentation.versionColumn(item, PackagePresentation.INSTALLED));
        assertTrue(PackagePresentation.details(item).contains("Installed version (saved): 1.2"));
        registry = InstalledPackages.parse(0, "demo.app|Demo|0|application");
        registry.readVersions(0, "[installed:demo.app]\n[nemesis]\nversion=2.0\n");
        InstalledVersionStore.apply(context, registry);
        assertEquals("2.0", registry.versions.get("demo.app"));
        assertFalse(registry.savedVersions.contains("demo.app"));
        registry = InstalledPackages.parse(0, "demo.app|Demo|0|application");
        InstalledVersionStore.apply(context, registry);
        assertEquals("2.0", registry.versions.get("demo.app"));
        InstalledVersionStore.apply(context, InstalledPackages.parse(1, "error"));
        InstalledVersionStore.apply(context, InstalledPackages.parse(0, ""));
        registry = InstalledPackages.parse(0, "demo.app|Demo|0|application");
        InstalledVersionStore.apply(context, registry);
        assertFalse(registry.versions.containsKey("demo.app"));
        InstalledVersionStore.record(context, "demo.app", "3", false);
        InstalledVersionStore.record(context, "demo.app", "3", true);
        InstalledVersionStore.record(context, "demo.app", null, false);
        InstalledVersionStore.apply(context, registry);
        assertFalse(registry.versions.containsKey("demo.app"));
    }
}
