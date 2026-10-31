package dev.nemesis.usbmanager;

import android.app.AlertDialog;
import android.app.Dialog;
import android.view.View;
import android.view.ViewGroup;
import android.widget.*;
import java.lang.reflect.*;
import java.util.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.Config;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.shadows.*;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=19,manifest=Config.NONE)
public class VehicleUsabilityTest {
    private ActivityController<MainActivity> controller;
    private MainActivity activity;
    private void set(String name,Object value)throws Exception{Field f=MainActivity.class.getDeclaredField(name);f.setAccessible(true);f.set(activity,value);}
    private Object get(String name)throws Exception{Field f=MainActivity.class.getDeclaredField(name);f.setAccessible(true);return f.get(activity);}
    private void invoke(String name)throws Exception{Method m=MainActivity.class.getDeclaredMethod(name);m.setAccessible(true);m.invoke(activity);}
    private List<View> views(View root){List<View> result=new ArrayList<View>();result.add(root);if(root instanceof ViewGroup){ViewGroup g=(ViewGroup)root;for(int i=0;i<g.getChildCount();i++)result.addAll(views(g.getChildAt(i)));}return result;}
    @Before public void create()throws Exception{controller=Robolectric.buildActivity(MainActivity.class).create().start().visible();activity=controller.get();set("resumed",true);}
    @After public void destroy(){controller.stop().destroy();}
    private AlertDialog picker()throws Exception{invoke("showSettings");return (AlertDialog)ShadowDialog.getLatestDialog();}
    @Test public void startupHasOnlySourceAndRememberControls()throws Exception {
        activity.getPreferences(0).edit().putString("registry_url", "").apply();
        invoke("chooseSource"); AlertDialog dialog=(AlertDialog)ShadowDialog.getLatestDialog();
        for(View view:views(dialog.getWindow().getDecorView())) assertFalse(view instanceof EditText);
        Method url=MainActivity.class.getDeclaredMethod("registryUrl");url.setAccessible(true);
        assertEquals(MainActivity.DEFAULT_REGISTRY_URL,url.invoke(activity));
    }
    @Test public void settingsDefaultsFiltersAndKeyboardCanBeDismissed()throws Exception {
        AlertDialog dialog=picker(); List<EditText> fields=new ArrayList<EditText>();
        for(View view:views(dialog.getWindow().getDecorView())) if(view instanceof EditText) fields.add((EditText)view);
        assertEquals(MainActivity.DEFAULT_REGISTRY_URL,fields.get(0).getText().toString());
        android.view.inputmethod.InputMethodManager keyboard=(android.view.inputmethod.InputMethodManager)activity.getSystemService(android.content.Context.INPUT_METHOD_SERVICE);
        fields.get(2).requestFocus();keyboard.showSoftInput(fields.get(2),0);
        fields.get(2).onEditorAction(android.view.inputmethod.EditorInfo.IME_ACTION_DONE);
        assertFalse(((ShadowInputMethodManager)org.robolectric.shadow.api.Shadow.extract(keyboard)).isSoftInputVisible());
        fields.get(2).requestFocus();keyboard.showSoftInput(fields.get(2),0);
        dialog.getButton(AlertDialog.BUTTON_NEUTRAL).performClick();
        assertTrue(dialog.isShowing());assertFalse(fields.get(2).hasFocus());assertFalse(((ShadowInputMethodManager)org.robolectric.shadow.api.Shadow.extract(keyboard)).isSoftInputVisible());
        fields.get(2).setText("Example"); fields.get(3).setText("260507");fields.get(4).setText("2.1");
        set("destroyed",true);dialog.getButton(-1).performClick();set("destroyed",false);
        assertEquals("Example",activity.getPreferences(0).getString("device_vehicle",""));
        assertEquals("260507",activity.getPreferences(0).getString("device_firmware",""));
        assertEquals("2.1",activity.getPreferences(0).getString("device_nemesis",""));
    }
    @Test public void browserGroupsVersionsCountsPackagesAndAppliesFilters()throws Exception {
        ArrayList<PackageScanner.Item> all=(ArrayList<PackageScanner.Item>)get("allItems");
        for(String version:new String[]{"0.1.0-build.1","0.1.0-build.2"}) {
            PackageRecord record=new PackageRecord();record.id="example.app";record.name="Example";record.version=version;
            all.add(CloudPackageSource.item(record,null));
        }
        PackageRecord record=new PackageRecord();record.id="other.app";record.name="Other";record.version="1";all.add(CloudPackageSource.item(record,null));
        set("category",PackagePresentation.NOT_INSTALLED);
        Method filter=MainActivity.class.getDeclaredMethod("filterItems",String.class);filter.setAccessible(true);filter.invoke(activity,new Object[]{null});
        ArrayList<PackageScanner.Item> shown=(ArrayList<PackageScanner.Item>)get("items");
        assertEquals(2,shown.size());assertEquals("0.1.0-build.2",shown.get(0).version);
        assertEquals("Available (2)",((Button[])get("tabs"))[2].getText().toString());
        set("selected",0);invoke("chooseAction");AlertDialog picker=(AlertDialog)ShadowDialog.getLatestDialog();assertEquals(2,picker.getListView().getCount());picker.dismiss();
        set("browserQuery","EXAMPLE.APP");filter.invoke(activity,new Object[]{null});assertEquals(1,shown.size());
        set("browserQuery","missing");filter.invoke(activity,new Object[]{null});assertTrue(shown.isEmpty());assertTrue(((TextView)get("empty")).getText().toString().contains("filters"));
    }

    @Test public void keyboardHandlesEnterAndLeavesOtherActionsAlone()throws Exception {
        AlertDialog dialog=picker();EditText field=null;
        for(View view:views(dialog.getWindow().getDecorView()))if(view instanceof EditText){field=(EditText)view;break;}
        assertNotNull(field);
        assertEquals(android.view.inputmethod.EditorInfo.IME_ACTION_DONE,field.getImeOptions() & android.view.inputmethod.EditorInfo.IME_MASK_ACTION);
        field.onEditorAction(android.view.inputmethod.EditorInfo.IME_ACTION_NEXT);
        field.dispatchKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN,android.view.KeyEvent.KEYCODE_ENTER));
        field.dispatchKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_UP,android.view.KeyEvent.KEYCODE_ENTER));
        assertTrue(dialog.isShowing());dialog.getButton(-2).performClick();ShadowLooper.runUiThreadTasks();assertFalse(dialog.isShowing());
        assertFalse(activity.getPreferences(0).contains("browser_query"));
    }
    @Test public void usbVersionsKeepTheirInstallersAndScriptsSeparate()throws Exception {
        ArrayList<PackageScanner.Item> all=(ArrayList<PackageScanner.Item>)get("allItems");
        for(String version:new String[]{"release-blue","2.0","1.0","release-red","2.0"}) {
            PackageScanner.Item item=new PackageScanner.Item();item.id="example.app";item.title="Example";item.version=version;item.kind=PackageScanner.INSTALL;item.target=new java.io.File("/usb/"+all.size());all.add(item);
        }
        PackageScanner.Item script=new PackageScanner.Item();script.id="example.app";script.kind=PackageScanner.EXECUTE;script.target=new java.io.File("/usb/task.sh");all.add(script);
        PackageScanner.Item broken=new PackageScanner.Item();broken.kind=PackageScanner.BROKEN;broken.target=new java.io.File("/usb/broken");all.add(broken);
        PackageScanner.Item installed=new PackageScanner.Item();installed.id="example.app";installed.kind="installed";all.add(installed);
        Method versions=MainActivity.class.getDeclaredMethod("packageVersions",PackageScanner.Item.class);versions.setAccessible(true);
        ArrayList<PackageScanner.Item> sorted=(ArrayList<PackageScanner.Item>)versions.invoke(activity,all.get(0));
        assertEquals(5,sorted.size());assertEquals("2.0",sorted.get(0).version);assertEquals("1.0",sorted.get(2).version);
        assertTrue(((ArrayList<?>)versions.invoke(activity,script)).isEmpty());assertTrue(((ArrayList<?>)versions.invoke(activity,broken)).isEmpty());
        PackageScanner.Item unknown=new PackageScanner.Item();unknown.kind=PackageScanner.INSTALL;assertTrue(((ArrayList<?>)versions.invoke(activity,unknown)).isEmpty());
        ArrayList<PackageScanner.Item> grouped=PackagePresentation.uniquePackages(all);assertEquals(3,grouped.size());assertEquals("release-blue",grouped.get(0).version);
        set("category",PackagePresentation.NOT_INSTALLED);Method filter=MainActivity.class.getDeclaredMethod("filterItems",String.class);filter.setAccessible(true);filter.invoke(activity,new Object[]{null});set("selected",0);invoke("chooseAction");
        AlertDialog picker=(AlertDialog)ShadowDialog.getLatestDialog();picker.getListView().performItemClick(null,0,0);
        Dialog confirm=ShadowDialog.getLatestDialog();assertNotSame(picker,confirm);
        assertTrue(confirm.isShowing());
    }
    @Test public void groupingPrefersInstallableReleasesAndRetainsUnknownVersions() {
        ArrayList<PackageScanner.Item> releases=new ArrayList<PackageScanner.Item>();
        for(String version:new String[]{"2","1","release-blue","release-red"}) {
            PackageScanner.Item item=new PackageScanner.Item();item.id="example.app";item.version=version;item.kind=PackageScanner.INSTALL;item.installed=true;item.installedVersion="1";releases.add(item);
        }
        assertSame(releases.get(0),PackagePresentation.uniquePackages(releases).get(0));
        releases.get(0).locked=true;assertSame(releases.get(2),PackagePresentation.uniquePackages(releases).get(0));
        Collections.reverse(releases);assertSame(releases.get(0),PackagePresentation.uniquePackages(releases).get(0));
        PackageScanner.Item unknown=new PackageScanner.Item();unknown.kind=PackageScanner.INSTALL;unknown.target=new java.io.File("/usb/unknown");releases.add(unknown);
        assertEquals(2,PackagePresentation.uniquePackages(releases).size());
    }
    @Test public void browserDoneHidesKeyboardWithoutInterruptingLiveSearch()throws Exception {
        EditText search=(EditText)get("browserSearch");
        android.view.inputmethod.InputMethodManager keyboard=(android.view.inputmethod.InputMethodManager)activity.getSystemService(android.content.Context.INPUT_METHOD_SERVICE);
        search.requestFocus();keyboard.showSoftInput(search,0);search.onEditorAction(android.view.inputmethod.EditorInfo.IME_ACTION_DONE);
        assertFalse(((ShadowInputMethodManager)org.robolectric.shadow.api.Shadow.extract(keyboard)).isSoftInputVisible());assertFalse(search.hasFocus());assertFalse((Boolean)get("busy"));
    }
    @Test public void repeatedArbitraryVersionsHaveStableOrderingAcrossUsbFolders()throws Exception {
        ArrayList<PackageScanner.Item> all=(ArrayList<PackageScanner.Item>)get("allItems");
        String[] labels={"release-red","release-blue","release-red","10","2","v2","2.0",null,""};
        ArrayList<PackageScanner.Item> sources=new ArrayList<PackageScanner.Item>();
        for(int i=0;i<labels.length;i++) {
            PackageScanner.Item item=new PackageScanner.Item();item.id="example.app";item.title="Example";item.kind=PackageScanner.INSTALL;item.version=labels[i];item.target=new java.io.File("/usb/"+(char)('a'+i)+"/installer.zip");sources.add(item);
        }
        // Numeric releases descend; equivalent numeric versions and repeated labels use source paths.
        List<PackageScanner.Item> expected=Arrays.asList(sources.get(3),sources.get(4),sources.get(5),sources.get(6),sources.get(7),sources.get(8),sources.get(1),sources.get(0),sources.get(2));
        Method versions=MainActivity.class.getDeclaredMethod("packageVersions",PackageScanner.Item.class);versions.setAccessible(true);
        Random random=new Random(47);
        for(int attempt=0;attempt<100;attempt++) {
            all.clear();all.addAll(sources);Collections.shuffle(all,random);
            assertEquals("Input order must not change version ordering",expected,versions.invoke(activity,sources.get(0)));
        }
        Method picker=MainActivity.class.getDeclaredMethod("choosePackageVersion",PackageScanner.Item.class);picker.setAccessible(true);picker.invoke(activity,sources.get(0));
        AlertDialog dialog=(AlertDialog)ShadowDialog.getLatestDialog();assertEquals(sources.size(),dialog.getListView().getCount());
        for(int row:new int[]{6,7,8}) assertTrue(dialog.getListView().getAdapter().getItem(row).toString().contains(expected.get(row).target.getParentFile().getName()+"/installer.zip"));
    }
    @Test public void backDismissesKeyboardForEveryFieldWithoutClosingSettingsOrLosingEdits()throws Exception {
        AlertDialog dialog=picker();
        android.view.inputmethod.InputMethodManager keyboard=(android.view.inputmethod.InputMethodManager)activity.getSystemService(android.content.Context.INPUT_METHOD_SERVICE);
        ShadowInputMethodManager shadow=org.robolectric.shadow.api.Shadow.extract(keyboard);
        int count=0;
        for(View view:views(dialog.getWindow().getDecorView())) if(view instanceof EditText) {
            EditText field=(EditText)view;
            field.setText("unsaved " + count++);
            assertTrue(field.requestFocus());
            keyboard.showSoftInput(field,0);
            assertTrue(shadow.isSoftInputVisible());
            assertTrue(field.dispatchKeyEventPreIme(new android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN,android.view.KeyEvent.KEYCODE_BACK)));
            assertTrue(field.dispatchKeyEventPreIme(new android.view.KeyEvent(android.view.KeyEvent.ACTION_UP,android.view.KeyEvent.KEYCODE_BACK)));
            assertFalse(shadow.isSoftInputVisible());
            assertFalse(field.hasFocus());
            assertTrue(dialog.isShowing());
            assertEquals("unsaved " + (count-1),field.getText().toString());
            // Hiding the IME must not prevent editing the field again.
            assertTrue(field.requestFocus());
            keyboard.showSoftInput(field,0);
            assertTrue(shadow.isSoftInputVisible());
            field.onEditorAction(android.view.inputmethod.EditorInfo.IME_ACTION_DONE);
            assertFalse(shadow.isSoftInputVisible());
            assertFalse(field.hasFocus());
            assertEquals(android.view.inputmethod.EditorInfo.IME_FLAG_NO_FULLSCREEN,field.getImeOptions() & android.view.inputmethod.EditorInfo.IME_FLAG_NO_FULLSCREEN);
        }
        assertEquals(5,count);
        assertFalse(activity.getPreferences(0).contains("browser_query"));
    }

    @Test public void hardwareEnterAndHideButtonReleaseEditorAndKeepSettingsOpen()throws Exception {
        AlertDialog dialog=picker();
        android.view.inputmethod.InputMethodManager keyboard=(android.view.inputmethod.InputMethodManager)activity.getSystemService(android.content.Context.INPUT_METHOD_SERVICE);
        ShadowInputMethodManager shadow=org.robolectric.shadow.api.Shadow.extract(keyboard);
        for(View view:views(dialog.getWindow().getDecorView())) if(view instanceof EditText) {
            EditText field=(EditText)view;
            field.requestFocus();keyboard.showSoftInput(field,0);
            field.dispatchKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN,android.view.KeyEvent.KEYCODE_ENTER));
            field.dispatchKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_UP,android.view.KeyEvent.KEYCODE_ENTER));
            assertFalse(shadow.isSoftInputVisible());assertFalse(field.hasFocus());assertTrue(dialog.isShowing());
            field.requestFocus();keyboard.showSoftInput(field,0);
            dialog.getButton(android.content.DialogInterface.BUTTON_NEUTRAL).performClick();
            assertFalse(shadow.isSoftInputVisible());assertFalse(field.hasFocus());assertTrue(dialog.isShowing());
        }
    }

    @Test public void browserBackHidesKeyboardAndPreservesSearch()throws Exception {
        EditText search=(EditText)get("browserSearch");
        android.view.inputmethod.InputMethodManager keyboard=(android.view.inputmethod.InputMethodManager)activity.getSystemService(android.content.Context.INPUT_METHOD_SERVICE);
        search.setText("demo");search.requestFocus();keyboard.showSoftInput(search,0);
        assertTrue(search.dispatchKeyEventPreIme(new android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN,android.view.KeyEvent.KEYCODE_BACK)));
        assertTrue(search.dispatchKeyEventPreIme(new android.view.KeyEvent(android.view.KeyEvent.ACTION_UP,android.view.KeyEvent.KEYCODE_BACK)));
        assertFalse(((ShadowInputMethodManager)org.robolectric.shadow.api.Shadow.extract(keyboard)).isSoftInputVisible());
        assertFalse(search.hasFocus());assertEquals("demo",search.getText().toString());
        assertFalse(activity.isFinishing());
        assertTrue(search.requestFocus());
    }
}
