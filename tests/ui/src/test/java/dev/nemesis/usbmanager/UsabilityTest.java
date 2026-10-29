package dev.nemesis.usbmanager;

import android.app.Activity;
import android.app.Dialog;
import android.graphics.drawable.ColorDrawable;
import android.view.View;
import android.view.ViewGroup;
import android.widget.TextView;
import android.widget.ScrollView;
import android.widget.ListView;
import android.widget.BaseAdapter;
import java.io.File;
import java.lang.reflect.Field;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowDialog;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk = 19, manifest = Config.NONE, qualifiers = "w853dp-h480dp-land-hdpi")
public class UsabilityTest {
    private List<TextView> texts(View root) {
        List<TextView> result = new ArrayList<TextView>();
        if (root instanceof TextView) result.add((TextView) root);
        if (root instanceof ViewGroup) {
            ViewGroup group = (ViewGroup) root;
            for (int i = 0; i < group.getChildCount(); i++) result.addAll(texts(group.getChildAt(i)));
        }
        return result;
    }
    private TextView find(Dialog dialog, String text) {
        for (TextView view : texts(dialog.getWindow().getDecorView())) if (text.equals(view.getText().toString())) return view;
        throw new AssertionError("Missing visible text: " + text);
    }
    private Object field(MainActivity activity, String name) throws Exception {
        Field field = MainActivity.class.getDeclaredField(name); field.setAccessible(true); return field.get(activity);
    }
    @Test public void packageRowsShowOneNameAndSelectionChangesAction() throws Exception {
        ActivityController<MainActivity> controller = Robolectric.buildActivity(MainActivity.class).create().start().visible();
        MainActivity activity = controller.get();
        // Supply a local fixture without starting a head-unit command or a USB scan.
        Field resumed = MainActivity.class.getDeclaredField("resumed"); resumed.setAccessible(true); resumed.set(activity, true);
        PackageScanner.Item item = new PackageScanner.Item();
        item.title = "Example App"; item.id = "example.app"; item.kind = PackageScanner.INSTALL;
        item.types = "application,service"; item.installed = true;
        item.version = "1.2"; item.installedVersion = "1.1";
        item.target = new File("/storage/usb0/packages/ExampleApp/example.app.zip");
        ((ArrayList<PackageScanner.Item>) field(activity, "items")).add(item);
        ((BaseAdapter) field(activity, "adapter")).notifyDataSetChanged();
        View root = activity.findViewById(android.R.id.content);
        root.measure(View.MeasureSpec.makeMeasureSpec(1280, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(720, View.MeasureSpec.EXACTLY));
        root.layout(0, 0, 1280, 720);
        TextView refresh = (TextView) field(activity, "refreshButton");
        TextView close = null;
        for (TextView view : texts(root)) if ("Close".equals(view.getText().toString())) close = view;
        assertNotNull(close);
        assertTrue("Refresh and Close have separate touch targets", close.getLeft() - refresh.getRight() >= 20);
        assertTrue("Header buttons fit on screen", close.getRight() <= ((View) close.getParent()).getWidth());
        for (android.widget.Button tab : (android.widget.Button[]) field(activity, "tabs")) {
            assertTrue("Category touch targets remain usable", tab.getHeight() >= 48);
            assertTrue("Category labels fit in landscape", tab.getWidth() > 100);
        }
        ListView list = (ListView) field(activity, "list");
        ViewGroup packageRow = (ViewGroup) ((BaseAdapter) field(activity, "adapter")).getView(0, null, list);
        assertEquals(2, packageRow.getChildCount());
        assertEquals("v1.1", ((TextView) packageRow.getChildAt(1)).getText().toString());
        android.widget.LinearLayout.LayoutParams nameLayout = (android.widget.LinearLayout.LayoutParams) packageRow.getChildAt(0).getLayoutParams();
        android.widget.LinearLayout.LayoutParams versionLayout = (android.widget.LinearLayout.LayoutParams) packageRow.getChildAt(1).getLayoutParams();
        assertTrue("Names receive more room than versions", nameLayout.weight > versionLayout.weight);
        TextView rowState = (TextView) ((ViewGroup) packageRow.getChildAt(0)).getChildAt(1);
        assertEquals("Update exceptions remain visible", View.VISIBLE, rowState.getVisibility());
        item.version = "1.1";
        ((BaseAdapter) field(activity, "adapter")).getView(0, packageRow, list);
        assertEquals("Routine installed state is already supplied by the tab", View.GONE, rowState.getVisibility());
        item.kind = PackageScanner.BROKEN;
        ((BaseAdapter) field(activity, "adapter")).getView(0, packageRow, list);
        assertEquals("Recycled rows still expose invalid installers", View.VISIBLE, rowState.getVisibility());
        assertEquals("Invalid installer", rowState.getText().toString());
        item.kind = PackageScanner.INSTALL; item.version = "1.2";
        for (String heading : new String[] { "Name", "Version" }) {
            boolean present = false;
            for (TextView view : texts(root)) if (heading.equals(view.getText().toString())) present = true;
            assertTrue("Column heading is visible: " + heading, present);
        }
        list.performItemClick(list.getChildAt(0), 0, 0);
        int names = 0;
        TextView update = null;
        for (TextView text : texts(root)) {
            if ("Example App".equals(text.getText().toString())) names++;
            assertFalse("Full USB paths belong in Details", text.getText().toString().contains("/storage/usb0"));
            if ("Update".equals(text.getText().toString())) update = text;
        }
        assertEquals(1, names); assertNotNull(update); assertTrue(update.isEnabled());
        ((View) field(activity, "details")).performClick();
        Dialog details = ShadowDialog.getLatestDialog();
        find(details, PackagePresentation.details(item));
        details.dismiss();
        item.id = "usb.package.manager";
        list.performItemClick(list.getChildAt(0), 0, 0);
        assertFalse("Manager cannot uninstall itself", ((View) field(activity, "uninstall")).isEnabled());
        assertTrue("Installed manager can update through NEMESIS", ((View) field(activity, "action")).isEnabled());
        assertTrue("Manager details stay accessible", ((View) field(activity, "details")).isEnabled());
        Field busy = MainActivity.class.getDeclaredField("busy"); busy.setAccessible(true); busy.set(activity, true);
        java.lang.reflect.Method updateMethod = MainActivity.class.getDeclaredMethod("updateButtons");
        updateMethod.setAccessible(true); updateMethod.invoke(activity);
        assertEquals("Busy operations display progress", View.VISIBLE, ((View) field(activity, "progress")).getVisibility());
        assertFalse(((View) field(activity, "action")).isEnabled());
        controller.stop().destroy();
        assertFalse("Destroyed activity dismisses its dialogs", details.isShowing());
    }
    @Test public void readableCompletionUnderLightOemTheme() {
        ActivityController<Activity> controller = Robolectric.buildActivity(Activity.class).setup();
        Activity activity = controller.get();
        activity.setTheme(android.R.style.Theme_Holo_Light);
        PackageScanner.Item item = new PackageScanner.Item(); item.title = "Example App";
        OperationCoordinator.Completion result = PackagePresentation.completion(item, "install", 0, "");
        Dialog dialog = ManagerDialogs.show(activity, result.title, result.output, "OK", null, null, null);
        TextView body = find(dialog, result.output);
        assertEquals(ManagerDialogs.TEXT, body.getCurrentTextColor());
        assertEquals(ManagerDialogs.BACKGROUND, ((ColorDrawable) body.getBackground()).getColor());
        assertNotEquals(body.getCurrentTextColor(), ((ColorDrawable) body.getBackground()).getColor());
        assertTrue(body.isTextSelectable());
        find(dialog, "OK").performClick();
        assertFalse(dialog.isShowing());
        controller.pause().stop().destroy();
    }
    @Test public void cancelCannotExecuteAndConfirmExecutesOnce() {
        ActivityController<Activity> controller = Robolectric.buildActivity(Activity.class).setup();
        Activity activity = controller.get();
        final AtomicBoolean executed = new AtomicBoolean();
        Runnable action = new Runnable() { public void run() { executed.set(true); } };
        Dialog cancelled = ManagerDialogs.show(activity, "Uninstall Example App?", "USB data will be kept.", "Uninstall", action, null, null);
        find(cancelled, "Cancel").performClick();
        assertFalse(executed.get());
        Dialog confirmed = ManagerDialogs.show(activity, "Uninstall Example App?", "USB data will be kept.", "Uninstall", action, null, null);
        assertTrue(((android.widget.LinearLayout.LayoutParams) find(confirmed, "Uninstall").getLayoutParams()).leftMargin > 0);
        find(confirmed, "Uninstall").performClick();
        assertTrue(executed.get()); assertFalse(confirmed.isShowing());
        controller.pause().stop().destroy();
    }
    @Test public void longDetailsStayScrollableAndActionsFitLandscape() {
        ActivityController<Activity> controller = Robolectric.buildActivity(Activity.class).setup();
        Activity activity = controller.get();
        StringBuilder output = new StringBuilder();
        for (int i = 0; i < 100; i++) output.append("Diagnostic output line ").append(i).append('\n');
        Dialog dialog = ManagerDialogs.show(activity, "Operation details", output.toString(), "OK", null, null, null);
        ViewGroup root = (ViewGroup) dialog.findViewById(android.R.id.content);
        int width = activity.getResources().getDisplayMetrics().widthPixels - 48;
        int height = activity.getResources().getDisplayMetrics().heightPixels;
        root.measure(View.MeasureSpec.makeMeasureSpec(width, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(height, View.MeasureSpec.AT_MOST));
        root.layout(0, 0, root.getMeasuredWidth(), root.getMeasuredHeight());
        TextView body = find(dialog, output.toString());
        assertTrue(body.getParent() instanceof ScrollView);
        assertTrue(((ScrollView) body.getParent()).getMeasuredHeight() < body.getMeasuredHeight());
        assertTrue(root.getMeasuredHeight() <= height);
        assertTrue(find(dialog, "OK").getMeasuredHeight() > 0);
        dialog.dismiss(); controller.pause().stop().destroy();
    }
    @Test public void dialogControlsShowWhichButtonHasKeyboardFocus() {
        ActivityController<Activity> controller = Robolectric.buildActivity(Activity.class).setup();
        Activity activity = controller.get();
        Dialog dialog = ManagerDialogs.show(activity, "Uninstall Example App?", "USB data will be kept.",
            "Uninstall", new Runnable() { public void run() { } }, null, null);
        TextView cancel = find(dialog, "Cancel");
        TextView uninstall = find(dialog, "Uninstall");
        assertTrue(cancel.requestFocus());
        assertTrue(cancel.isFocused());
        int focused = ((ColorDrawable) cancel.getBackground().getCurrent()).getColor();
        assertNotEquals("Keyboard focus must be visible", ManagerDialogs.PANEL, focused);
        assertTrue(uninstall.requestFocus());
        assertFalse(cancel.isFocused());
        assertEquals("Previous control returns to its normal color", ManagerDialogs.PANEL,
            ((ColorDrawable) cancel.getBackground().getCurrent()).getColor());
        assertEquals("Primary action also shows keyboard focus", focused,
            ((ColorDrawable) uninstall.getBackground().getCurrent()).getColor());
        dialog.dismiss(); controller.pause().stop().destroy();
    }
}
