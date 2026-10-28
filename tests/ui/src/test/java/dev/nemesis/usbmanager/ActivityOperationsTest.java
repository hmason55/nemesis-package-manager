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
    ActivityOperationsTest.UsbLocation.class, ActivityOperationsTest.Commands.class
})
@LooperMode(LooperMode.Mode.PAUSED)
public class ActivityOperationsTest {
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
        @Implementation protected static NemesisCli.Result run(String... args) {
            calls.add(Arrays.asList(args));
            if ("pkg-list".equals(args[0])) return new NemesisCli.Result(registryStatus, registry);
            if ("pkg-info".equals(args[0])) return new NemesisCli.Result(0, "id=demo.app\ninstalled=1\nlocked=0\n");
            if ("root".equals(args[0])) return new NemesisCli.Result(0, "[installed:demo.app]\n[nemesis]\nversion=1.0\n");
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
        await(() -> !((Boolean) field("busy")));
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
        assertTrue(((TextView) field("status")).getText().toString().contains("3 installed packages"));
        select("service.app");
        assertFalse(((View) field("action")).isEnabled());
        assertFalse(((View) field("launch")).isEnabled());
        assertTrue(((View) field("uninstall")).isEnabled());
        select("locked.app");
        assertFalse(((View) field("uninstall")).isEnabled());
        select("demo.app");
        click("details");
        dialogClick("OK");
        click("status");
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

    @Test public void registryFailureIsVisibleAndRefreshRecovers() throws Exception {
        usbInstaller();
        Commands.registryStatus = 2;
        Commands.registry = "daemon unavailable";
        open();
        assertEquals(0, ((BaseAdapter) field("adapter")).getCount());
        assertFalse(((View) field("action")).isEnabled());
        assertFalse(((View) field("uninstall")).isEnabled());
        assertFalse(((View) field("details")).isEnabled());
        assertTrue(((TextView) field("status")).getText().toString().contains("daemon unavailable"));
        Commands.registryStatus = 0;
        Commands.registry = "";
        click("refreshButton");
        await(() -> !((Boolean) field("busy")));
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

    @Test public void categoryTabsFilterAndSameVersionCannotStartUpdate() throws Exception {
        File root = usbInstaller();
        ScannerTest.zip(new File(root, "packages/Demo/demo.zip"), "[nemesis]\nid=demo.app\nname=Demo\nversion=1.0\n", false);
        open();
        select("demo.app");
        assertEquals("Up to date", ((TextView) field("action")).getText().toString());
        assertFalse(((View) field("action")).isEnabled());
        android.widget.Button[] tabs = (android.widget.Button[]) field("tabs");
        assertEquals(4, tabs.length);
        String[] expectedTabs = { "Installed", "Updates", "Not Installed", "Scripts" };
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
        assertEquals("Up to date", ((TextView) field("action")).getText().toString());
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
        assertTrue(((View) field("action")).isEnabled());
        tabs[PackagePresentation.UPDATES].performClick();
        assertEquals(1, adapter.getCount());
        assertEquals("demo.app", ((PackageScanner.Item) adapter.getItem(0)).id);
        ViewGroup updateRow = (ViewGroup) adapter.getView(0, null, (ListView) field("list"));
        assertEquals(2, updateRow.getChildCount());
        assertEquals("v1.0 \u2192 v1.1", ((TextView) updateRow.getChildAt(1)).getText().toString());
        tabs[PackagePresentation.NOT_INSTALLED].performClick();
        assertEquals(1, adapter.getCount());
        assertEquals("new.app", ((PackageScanner.Item) adapter.getItem(0)).id);
        ViewGroup newRow = (ViewGroup) adapter.getView(0, updateRow, (ListView) field("list"));
        assertEquals("v2.0", ((TextView) newRow.getChildAt(1)).getText().toString());
        select("new.app");
        assertEquals("Install", ((TextView) field("action")).getText().toString());
        tabs[PackagePresentation.INSTALLED].performClick();
        assertEquals(3, adapter.getCount());
        for (int i = 0; i < adapter.getCount(); i++) assertTrue(((PackageScanner.Item) adapter.getItem(i)).installed);
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
