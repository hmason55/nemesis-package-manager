package dev.nemesis.usbmanager;

import android.app.Dialog;
import android.view.View;
import android.view.ViewGroup;
import android.widget.BaseAdapter;
import android.widget.ListView;
import android.widget.TextView;
import java.io.File;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.CountDownLatch;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.function.BooleanSupplier;
import org.junit.After;
import org.junit.Before;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.shadows.ShadowLooper;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.Implementation;
import org.robolectric.annotation.Implements;
import org.robolectric.annotation.LooperMode;
import org.robolectric.shadows.ShadowDialog;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 19, manifest = Config.NONE, shadows = {
    ActivityOperationsTest.UsbLocation.class, ActivityOperationsTest.Commands.class, ActivityOperationsTest.CloudListing.class
})
@LooperMode(LooperMode.Mode.PAUSED)
public class ActivityOperationsTest {
    @Implements(value = CloudPackageSource.class, isInAndroidSdk = false)
    public static class CloudListing {
        static String lastQuery;
        @Implementation protected List<PackageRecord> list(String query) throws Exception {
            lastQuery=query;
            if ("offline".equals(query)) throw new java.io.IOException("Registry offline");
            PackageRecord record=new PackageRecord();record.id="demo.app";record.name="Cloud Demo";record.version="2.0";
            return Collections.singletonList(record);
        }
    }
    @Rule public TemporaryFolder temporary = new TemporaryFolder();
    private ActivityController<MainActivity> controller;
    private MainActivity activity;

    @Implements(value = PackageScanner.class, isInAndroidSdk = false)
    public static class UsbLocation {
        static File root;
        @Implementation protected static File findUsbRoot() { return root; }
    }

    @Implements(value = NemesisCli.class, isInAndroidSdk = false)
    public static class Commands {
        static String registry;
        static int registryStatus;
        static int actionStatus;
        static final List<List<String>> calls = Collections.synchronizedList(new ArrayList<List<String>>());
        @Implementation protected static NemesisCli.Result query(String... args) { return run(args); }
        @Implementation protected static NemesisCli.Result run(String... args) {
            calls.add(Arrays.asList(args));
            if ("pkg-list".equals(args[0])) return new NemesisCli.Result(registryStatus, registry);
            if ("pkg-info".equals(args[0])) return new NemesisCli.Result(0, "id=demo.app\ninstalled=1\nlocked=0\n");
            if ("root".equals(args[0])) {
                // Match the actual NEMESIS root command buffer, including its NUL terminator.
                if (args[2].length() >= 1024) return new NemesisCli.Result(2, "truncated shell command");
                return new NemesisCli.Result(0, "[installed:demo.app]\n\uFEFF[nemesis]\r\nversion=1.0\r\n");
            }
            return new NemesisCli.Result(actionStatus, actionStatus == 0 ? "done" : "permission denied");
        }
    }

    @Before public void resetCommands() {
        Commands.calls.clear();
        Commands.registry = "demo.app|Demo|0|application\nservice.app|Service|0|service\nlocked.app|Locked|1|application\n";
        Commands.registryStatus = 0;
        Commands.actionStatus = 0;
        UsbLocation.root = null;
    }

    @After public void destroyActivity() {
        if (controller != null) controller.pause().stop().destroy();
    }

    private Object field(String name) {
        try {
            Field field = MainActivity.class.getDeclaredField(name);
            field.setAccessible(true);
            return field.get(activity);
        } catch (ReflectiveOperationException error) { throw new AssertionError(error); }
    }

    private void await(BooleanSupplier condition) {
        long deadline = System.nanoTime() + 5_000_000_000L;
        while (!condition.getAsBoolean() && System.nanoTime() < deadline) {
            ShadowLooper.idleMainLooper(500, TimeUnit.MILLISECONDS);
            Thread.yield();
        }
        assertTrue("Background work did not reach its expected UI state", condition.getAsBoolean());
    }

    private void open() {
        controller = Robolectric.buildActivity(MainActivity.class).create().start().resume().visible();
        activity = controller.get();
        Dialog source = ShadowDialog.getLatestDialog();
        if (source != null && source.isShowing() && find(source.getWindow().getDecorView(), "Continue") != null) {
            dialogClick("Continue");
            ShadowLooper.idleMainLooper();
        }
        await(() -> !((Boolean) field("busy")));
    }

    @Test public void firstRunPickerAcceptsSelectionBeforeAnyPackageScan() {
        controller = Robolectric.buildActivity(MainActivity.class).create().start().resume().visible();
        activity = controller.get();
        Dialog source = ShadowDialog.getLatestDialog();
        assertTrue(source.isShowing());
        assertFalse((Boolean) field("busy"));
        assertTrue("Startup must wait for the source choice", Commands.calls.isEmpty());
        android.widget.RadioButton cloud = source.findViewById(1001);
        android.widget.RadioButton usb = source.findViewById(1002);
        cloud.performClick();
        assertTrue(cloud.isChecked());
        usb.performClick();
        assertTrue(usb.isChecked());
        dialogClick("Continue");
        ShadowLooper.idleMainLooper();
        assertFalse(source.isShowing());
        await(() -> !((Boolean) field("busy")));
        assertFalse(Commands.calls.isEmpty());
    }

    @Test public void cancellingFirstRunPickerStillLoadsPackages() {
        controller = Robolectric.buildActivity(MainActivity.class).create().start().resume().visible();
        activity = controller.get();
        dialogClick("Cancel");
        ShadowLooper.idleMainLooper();
        await(() -> !((Boolean) field("busy")));
        assertEquals(3, ((BaseAdapter) field("adapter")).getCount());
    }

    @Test public void sourceAndSettingsControlsStayReadableWithLightActivityTheme() {
        controller = Robolectric.buildActivity(MainActivity.class);
        controller.get().setTheme(android.R.style.Theme_Holo_Light_NoActionBar);
        controller.create().start().resume().visible();
        activity = controller.get();
        Dialog source = ShadowDialog.getLatestDialog();
        assertDarkControl(source.findViewById(1001));
        assertDarkControl(source.findViewById(1002));
        assertDarkControl(find(source.getWindow().getDecorView(), "Don’t show again on startup"));
        dialogClick("Continue");
        ShadowLooper.idleMainLooper();
        await(() -> !((Boolean) field("busy")));
        find(activity.findViewById(android.R.id.content), "Settings").performClick();
        Dialog settings = ShadowDialog.getLatestDialog();
        assertDarkControl(find(settings.getWindow().getDecorView(), MainActivity.DEFAULT_REGISTRY_URL));
        assertDarkControl(find(settings.getWindow().getDecorView(), "Save"));
        dialogClick("Cancel");
        ShadowLooper.idleMainLooper();
        await(() -> !((Boolean) field("busy")));
        find(activity.findViewById(android.R.id.content), "Filters").performClick();
        Dialog filters = ShadowDialog.getLatestDialog();
        android.widget.Spinner type = findSpinner(filters.getWindow().getDecorView());
        assertNotNull(type);
        assertDarkControl((TextView) type.getAdapter().getView(0, null, type));
    }

    private android.widget.Spinner findSpinner(View view) {
        if (view instanceof android.widget.Spinner) return (android.widget.Spinner) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                android.widget.Spinner found = findSpinner(group.getChildAt(i));
                if (found != null) return found;
            }
        }
        return null;
    }

    private void assertDarkControl(TextView control) {
        assertNotNull(control);
        assertTrue(android.graphics.Color.red(control.getCurrentTextColor()) > 200);
        android.util.TypedValue background = new android.util.TypedValue();
        assertTrue(control.getContext().getTheme().resolveAttribute(android.R.attr.colorBackground, background, true));
        assertTrue(android.graphics.Color.red(background.data) < 100);
    }

    private TextView find(View view, String text) {
        if (view instanceof TextView && text.equals(((TextView) view).getText().toString())) return (TextView) view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                TextView found = find(group.getChildAt(i), text);
                if (found != null) return found;
            }
        }
        return null;
    }

    private void click(String fieldName) { assertTrue(((View) field(fieldName)).performClick()); }
    private void dialogClick(String text) {
        Dialog dialog = ShadowDialog.getLatestDialog();
        assertNotNull(dialog);
        TextView button = find(dialog.getWindow().getDecorView(), text);
        assertNotNull("Missing dialog button: " + text, button);
        assertTrue(button.performClick());
    }

    private void select(String id) {
        BaseAdapter adapter = (BaseAdapter) field("adapter");
        ListView list = (ListView) field("list");
        for (int i = 0; i < adapter.getCount(); i++) {
            PackageScanner.Item item = (PackageScanner.Item) adapter.getItem(i);
            if (id.equals(item.id)) {
                View row = adapter.getView(i, null, list);
                assertSame(row, adapter.getView(i, row, list));
                assertEquals(i, adapter.getItemId(i));
                list.performItemClick(row, i, i);
                return;
            }
        }
        fail("Missing package: " + id);
    }

    private File usbInstaller() throws Exception {
        File root = temporary.newFolder("usb");
        ScannerTest.zip(new File(root, "packages/Demo/demo.zip"), "[nemesis]\nid=demo.app\nname=Demo\nversion=1.1\n", false);
        UsbLocation.root = root;
        return root;
    }

    private void awaitCompletion() {
        await(() -> {
            Dialog dialog = ShadowDialog.getLatestDialog();
            return dialog != null && dialog.isShowing() && find(dialog.getWindow().getDecorView(), "Details") != null;
        });
        await(() -> !((Boolean) field("busy")));
    }

    @Test public void installedOnlyRowsRespectServiceAndLockStateAndCanClose() {
        open();
        assertEquals(3, ((BaseAdapter) field("adapter")).getCount());
        select("service.app");
        assertFalse(((View) field("action")).isEnabled());
        assertFalse(((View) field("launch")).isEnabled());
        assertTrue(((View) field("uninstall")).isEnabled());
        select("locked.app");
        assertFalse(((View) field("uninstall")).isEnabled());
        select("demo.app");
        click("details");
        dialogClick("OK");
        TextView close = find(activity.findViewById(android.R.id.content), "Close");
        assertNotNull(close);
        close.performClick();
        assertTrue(activity.isFinishing());
    }

    @Test public void cancelDoesNotUninstallAndConfirmShowsFailureDetails() throws Exception {
        File root = usbInstaller();
        open();
        select("demo.app");
        click("uninstall");
        dialogClick("Cancel");
        assertFalse(Commands.calls.stream().anyMatch(call -> "uninstall".equals(call.get(0))));
        Commands.actionStatus = 6;
        click("uninstall");
        dialogClick("Uninstall");
        awaitCompletion();
        assertTrue(Commands.calls.contains(Arrays.asList("uninstall", "demo.app")));
        dialogClick("Details");
        Dialog details = ShadowDialog.getLatestDialog();
        assertTrue(((TextView) findContaining(details.getWindow().getDecorView(), "Exit code: 6")).getText().toString().contains("permission denied"));
        dialogClick("OK");
        String history = new String(Files.readAllBytes(new File(root, "packages/Demo/data/package-manager-history.log").toPath()), StandardCharsets.UTF_8);
        assertTrue(history.contains("Operation: uninstall"));
        assertTrue(history.contains("permission denied"));
    }

    private View findContaining(View view, String value) {
        if (view instanceof TextView && ((TextView) view).getText().toString().contains(value)) return view;
        if (view instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) view;
            for (int i = 0; i < group.getChildCount(); i++) {
                View result = findContaining(group.getChildAt(i), value);
                if (result != null) return result;
            }
        }
        return null;
    }

    @Test public void updateUsesMetadataAndRefreshPreservesSelectedInstaller() throws Exception {
        usbInstaller();
        open();
        ((android.widget.Button[]) field("tabs"))[PackagePresentation.UPDATES].performClick();
        select("demo.app");
        click("refreshButton");
        await(() -> !((Boolean) field("busy")));
        assertEquals("Update", ((TextView) field("action")).getText().toString());
        assertTrue(((View) field("action")).isEnabled());
        click("action");
        dialogClick("Update");
        awaitCompletion();
        assertTrue(Commands.calls.stream().anyMatch(call -> call.size() == 3 && call.get(0).equals("install") && call.get(1).equals("--update")));
        dialogClick("OK");
        select("demo.app");
        click("launch");
        dialogClick("Launch");
        awaitCompletion();
        assertTrue(Commands.calls.contains(Arrays.asList("pkg-launch", "demo.app")));
    }
    @Test public void usbDiscoveryIgnoresAPreviousCloudSearch() throws Exception {
        usbInstaller(); open();
        Field search=MainActivity.class.getDeclaredField("cloudQuery");search.setAccessible(true);search.set(activity,"no-local-title-matches-this");
        click("refreshButton");await(() -> !((Boolean)field("busy")));
        assertTrue(((ArrayList<PackageScanner.Item>)field("allItems")).stream().anyMatch(item -> "demo.app".equals(item.id) && item.target != null));
    }
    @Test public void cloudRefreshUsesItsSearchAndKeepsInstalledStateDuringAnOutage() throws Exception {
        open();
        activity.getPreferences(0).edit().putString("registry_url","https://registry.test").apply();
        Field source=MainActivity.class.getDeclaredField("cloudSelected");source.setAccessible(true);source.set(activity,true);
        ((android.widget.Button[])field("tabs"))[PackagePresentation.NOT_INSTALLED].performClick();
        Field search=MainActivity.class.getDeclaredField("cloudQuery");search.setAccessible(true);search.set(activity,"demo");
        click("refreshButton");await(() -> !((Boolean)field("busy")));
        assertEquals("demo",CloudListing.lastQuery);
        assertTrue(((ArrayList<PackageScanner.Item>)field("allItems")).stream().anyMatch(item -> item.remote != null && item.installed && "1.0".equals(item.installedVersion)));
        search.set(activity,"offline");click("refreshButton");await(() -> !((Boolean)field("busy")));
        assertTrue(((ArrayList<PackageScanner.Item>)field("allItems")).stream().anyMatch(item -> "demo.app".equals(item.id) && item.installed && item.installedStateKnown));
        assertTrue(((String)field("scanError")).contains("Registry offline"));
    }

    @Test public void registryFailureIsVisibleAndRefreshRecovers() throws Exception {
        usbInstaller();
        Commands.registryStatus = 2;
        Commands.registry = "daemon unavailable";
        open();
        assertEquals(0, ((BaseAdapter) field("adapter")).getCount());
        assertFalse(((View) field("action")).isEnabled());
        assertFalse(((View) field("uninstall")).isEnabled());
        assertFalse(((View) field("details")).isEnabled());
        String status = ((TextView) field("empty")).getText().toString();
        assertTrue(status.contains("Tap Refresh"));
        assertFalse("Technical errors belong in Details", status.contains("daemon unavailable"));
        android.widget.Button[] tabs = (android.widget.Button[]) field("tabs");
        for (android.widget.Button tab : tabs) {
            tab.performClick();
            String guidance = ((TextView) field("empty")).getText().toString();
            assertTrue(guidance.contains("Could not load installed packages"));
            assertTrue(guidance.contains("Tap Refresh"));
        }
        tabs[PackagePresentation.INSTALLED].performClick();
        click("refreshButton");
        await(() -> !((Boolean) field("busy")));
        assertTrue(((TextView) field("empty")).getText().toString().contains("Could not load installed packages"));
        click("empty");
        assertNotNull(findContaining(ShadowDialog.getLatestDialog().getWindow().getDecorView(), "daemon unavailable"));
        dialogClick("OK");
        Commands.registryStatus = 0;
        Commands.registry = "";
        click("refreshButton");
        await(() -> !((Boolean) field("busy")));
        assertFalse(((TextView) field("empty")).getText().toString().contains("Could not load installed packages"));
        ((android.widget.Button[]) field("tabs"))[PackagePresentation.NOT_INSTALLED].performClick();
        select("demo.app");
        assertEquals("Install", ((TextView) field("action")).getText().toString());
        assertTrue(((View) field("action")).isEnabled());
    }

    @Test public void emptyRegistryExplainsHowToFindInstallers() {
        Commands.registry = "";
        open();
        assertTrue(((TextView) field("empty")).getText().toString().contains("Insert a USB drive"));
        assertFalse(((View) field("details")).isEnabled());
    }

    @Test public void runningOperationOffersGuidanceWithoutEnablingCompetingActions() throws Exception {
        open();
        final CountDownLatch finish = new CountDownLatch(1);
        OperationCoordinator owner = (OperationCoordinator) field("operations");
        assertTrue(owner.start("Installing Demo", new OperationCoordinator.Task() {
            public OperationCoordinator.Completion run() throws Exception {
                finish.await();
                return new OperationCoordinator.Completion(true, "Installed");
            }
        }));
        try {
            ((Runnable) field("monitorOperation")).run();
            assertTrue(((TextView) field("operationStatus")).getText().toString().contains("Installing Demo"));
            assertFalse(((View) field("refreshButton")).isEnabled());
            assertTrue(find((View) field("operationOverlay"), "Details").performClick());
            assertNotNull(findContaining(ShadowDialog.getLatestDialog().getWindow().getDecorView(), "other actions remain blocked"));
            assertTrue(owner.isRunning());
            dialogClick("OK");
        } finally { finish.countDown(); }
        awaitCompletion();
        dialogClick("OK");
    }

    @Test public void categoryTabsFilterAndSameVersionCannotStartUpdate() throws Exception {
        File root = usbInstaller();
        ScannerTest.zip(new File(root, "packages/Demo/demo.zip"), "[nemesis]\nid=demo.app\nname=Demo\nversion=1.0\n", false);
        open();
        select("demo.app");
        assertEquals(View.GONE, ((View) field("action")).getVisibility());
        assertFalse(((View) field("action")).isEnabled());
        android.widget.Button[] tabs = (android.widget.Button[]) field("tabs");
        assertEquals(4, tabs.length);
        String[] expectedTabs = { "Installed", "Updates", "Available", "Scripts" };
        for (int i = 0; i < tabs.length; i++) assertTrue(tabs[i].getText().toString().startsWith(expectedTabs[i] + " ("));
        tabs[PackagePresentation.UPDATES].performClick();
        assertEquals(0, ((BaseAdapter) field("adapter")).getCount());
        assertTrue(((TextView) field("empty")).getText().toString().contains("No confirmed updates"));
        assertFalse(((View) field("uninstall")).isEnabled());
        tabs[PackagePresentation.INSTALLED].performClick();
        assertEquals(3, ((BaseAdapter) field("adapter")).getCount());
        select("demo.app");
        click("refreshButton");
        await(() -> !((Boolean) field("busy")));
        assertEquals(View.GONE, ((View) field("action")).getVisibility());
        tabs[PackagePresentation.SCRIPTS].performClick();
        assertEquals(0, ((BaseAdapter) field("adapter")).getCount());
        tabs[PackagePresentation.INSTALLED].performClick();
        assertEquals(3, ((BaseAdapter) field("adapter")).getCount());
        assertFalse(Commands.calls.stream().anyMatch(call -> "install".equals(call.get(0))));
    }

    @Test public void installedUpdateAndNewInstallerTabsHaveConsistentMembership() throws Exception {
        File root = usbInstaller();
        ScannerTest.zip(new File(root, "packages/New/new.zip"), "[nemesis]\nid=new.app\nname=New App\nversion=2.0\n", false);
        open();
        android.widget.Button[] tabs = (android.widget.Button[]) field("tabs");
        BaseAdapter adapter = (BaseAdapter) field("adapter");
        assertEquals(3, adapter.getCount());
        select("demo.app");
        assertFalse(((View) field("action")).isEnabled());
        assertEquals(View.VISIBLE, ((View) field("uninstall")).getVisibility());
        tabs[PackagePresentation.UPDATES].performClick();
        assertEquals(1, adapter.getCount());
        assertEquals("demo.app", ((PackageScanner.Item) adapter.getItem(0)).id);
        ViewGroup updateRow = (ViewGroup) adapter.getView(0, null, (ListView) field("list"));
        assertEquals(2, updateRow.getChildCount());
        assertEquals("1.0 \u2192 1.1", ((TextView) updateRow.getChildAt(1)).getText().toString());
        tabs[PackagePresentation.NOT_INSTALLED].performClick();
        assertEquals(1, adapter.getCount());
        assertEquals("new.app", ((PackageScanner.Item) adapter.getItem(0)).id);
        ViewGroup newRow = (ViewGroup) adapter.getView(0, updateRow, (ListView) field("list"));
        assertEquals("2.0", ((TextView) newRow.getChildAt(1)).getText().toString());
        select("new.app");
        assertEquals("Install", ((TextView) field("action")).getText().toString());
        tabs[PackagePresentation.INSTALLED].performClick();
        assertEquals(3, adapter.getCount());
        for (int i = 0; i < adapter.getCount(); i++) assertTrue(((PackageScanner.Item) adapter.getItem(i)).installed);
    }

    @Test public void largeRegistryStillDetectsVersionsAndManagerIsAbsentFromEveryTab() throws Exception {
        File root = usbInstaller();
        String metadata = "[nemesis]\nid=usb.package.manager\nname=Package Manager\nversion=2.0\n";
        ScannerTest.zip(new File(root, "manager/usb.package.manager.zip"), metadata, false);
        ScannerTest.zip(new File(root, "packages/Manager/manager.zip"), metadata, false);
        Commands.registry += "usb.package.manager|Package Manager|0|application\n";
        for (int i = 0; i < 20; i++) Commands.registry += "long.installed.package." + i + "|App " + i + "|0|application\n";
        open();
        BaseAdapter adapter = (BaseAdapter) field("adapter");
        assertEquals(23, adapter.getCount());
        select("demo.app");
        assertEquals(View.GONE, ((View) field("action")).getVisibility());
        for (android.widget.Button tab : (android.widget.Button[]) field("tabs")) {
            tab.performClick();
            for (int i = 0; i < adapter.getCount(); i++)
                assertFalse(PackagePresentation.isManager((PackageScanner.Item) adapter.getItem(i)));
        }
        android.widget.Button[] tabs = (android.widget.Button[]) field("tabs");
        assertEquals("Installed (23)", tabs[0].getText().toString());
        assertEquals("Updates (1)", tabs[1].getText().toString());
        assertEquals("Available (0)", tabs[2].getText().toString());
        assertEquals("Scripts (0)", tabs[3].getText().toString());
        assertEquals(23, ((ArrayList<?>) field("allItems")).size());
    }

    @Test public void operationOverlayCoversEachActionAndSurvivesReopeningUntilCompletion() throws Exception {
        open();
        Field owner = MainActivity.class.getDeclaredField("operations"); owner.setAccessible(true);
        OperationCoordinator operations = (OperationCoordinator) owner.get(null);
        for (String description : new String[] {"Installing\nDemo", "Uninstalling\nDemo", "Updating\nDemo", "Running script\nDemo"}) {
            final CountDownLatch finish = new CountDownLatch(1);
            try {
                assertTrue(operations.start(description, () -> {
                    finish.await();
                    return new OperationCoordinator.Completion(!description.startsWith("Uninstalling"), "Finished", "Done", "Details");
                }));
                controller.pause().stop().destroy();
                controller = Robolectric.buildActivity(MainActivity.class).create().start().resume().visible();
                activity = controller.get();
                assertEquals(View.VISIBLE, ((View) field("operationOverlay")).getVisibility());
                assertEquals(View.VISIBLE, ((View) field("progress")).getVisibility());
                assertEquals(description.startsWith("Installing") || description.startsWith("Updating") ? View.VISIBLE : View.GONE,
                    ((View) field("operationInstruction")).getVisibility());
                assertFalse(((TextView) field("operationStatus")).getText().toString().contains("|"));
                assertTrue(((TextView) field("operationStatus")).getText().toString().startsWith(description));
                assertTrue(((View) field("operationOverlay")).isClickable());
                for (android.widget.Button tab : (android.widget.Button[]) field("tabs")) assertFalse(tab.isEnabled());
                assertFalse(((View) field("refreshButton")).isEnabled());
            } finally { finish.countDown(); }
            awaitCompletion();
            assertEquals(View.GONE, ((View) field("operationOverlay")).getVisibility());
            assertTrue(((View) field("refreshButton")).isEnabled());
            dialogClick("OK");
        }
    }

    @Test public void dialogsExplainBlankOutputAndOptionalSecondaryActionIsSafe() {
        open();
        for (String body : new String[] {null, " \n "}) {
            Dialog dialog = ManagerDialogs.show(activity, "Result", body, "OK", null, "Details", null);
            assertNotNull(find(dialog.getWindow().getDecorView(), "No additional information."));
            assertTrue(find(dialog.getWindow().getDecorView(), "Details").performClick());
            assertTrue(dialog.isShowing());
            assertTrue(find(dialog.getWindow().getDecorView(), "OK").performClick());
            assertFalse(dialog.isShowing());
        }
    }
}
