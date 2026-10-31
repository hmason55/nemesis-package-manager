package dev.nemesis.usbmanager;

import android.widget.EditText;
import android.widget.Spinner;
import android.view.View;
import android.view.ViewGroup;
import android.app.AlertDialog;
import org.robolectric.shadows.ShadowDialog;
import java.lang.reflect.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.BooleanSupplier;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.*;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.shadows.ShadowLooper;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=19,manifest=Config.NONE,shadows={BrowserSearchUiTest.Registry.class,ActivityOperationsTest.Commands.class,ActivityOperationsTest.UsbLocation.class})
@LooperMode(LooperMode.Mode.PAUSED)
public class BrowserSearchUiTest {
    private ActivityController<MainActivity> controller;private MainActivity activity;private EditText search;private boolean closed;
    @Implements(value=CloudPackageSource.class,isInAndroidSdk=false)
    public static class Registry {
        static List<String> queries;static CountDownLatch oldStarted,oldRelease;static String versionMode;
        @Implementation protected List<PackageRecord> list(String query)throws Exception {
            queries.add(query);if(query.startsWith("old")){oldStarted.countDown();oldRelease.await(3,TimeUnit.SECONDS);}
            if (query.endsWith("error")) throw new java.io.IOException("Network offline");
            PackageRecord row=new PackageRecord();row.id=query+".app";row.name=query;row.version="1";return Collections.singletonList(row);
        }
        @Implementation protected List<PackageRecord> versions(String id)throws Exception {
            if("hold".equals(versionMode)){oldStarted.countDown();oldRelease.await(3,TimeUnit.SECONDS);}
            if("error".equals(versionMode))throw new java.io.IOException("Versions offline");
            if("empty".equals(versionMode))return Collections.emptyList();
            PackageRecord row=new PackageRecord();row.id=id;row.name="Demo";row.version="release-red";return Collections.singletonList(row);
        }
    }
    private Object get(String name)throws Exception{Field f=MainActivity.class.getDeclaredField(name);f.setAccessible(true);return f.get(activity);}
    private void set(String name,Object value)throws Exception{Field f=MainActivity.class.getDeclaredField(name);f.setAccessible(true);f.set(activity,value);}
    private void invoke(String name)throws Exception{Method m=MainActivity.class.getDeclaredMethod(name);m.setAccessible(true);m.invoke(activity);}
    private void await(BooleanSupplier ready)throws Exception{for(int i=0;i<200;i++){ShadowLooper.idleMainLooper();if(ready.getAsBoolean())return;Thread.sleep(10);}fail("Async browser work did not finish");}
    private boolean idle(){try{return !(Boolean)get("busy");}catch(Exception e){throw new AssertionError(e);}}
    private List<PackageScanner.Item> all(){try{return (List<PackageScanner.Item>)get("allItems");}catch(Exception e){throw new AssertionError(e);}}
    @Before public void create()throws Exception{
        Registry.queries=Collections.synchronizedList(new ArrayList<String>());Registry.oldStarted=new CountDownLatch(1);Registry.oldRelease=new CountDownLatch(1);Registry.versionMode="normal";ActivityOperationsTest.Commands.calls.clear();
        ActivityOperationsTest.Commands.registry="demo.app|Demo|0|application\n";ActivityOperationsTest.Commands.registryStatus=0;ActivityOperationsTest.UsbLocation.root=null;
        controller=Robolectric.buildActivity(MainActivity.class).create().start().visible();activity=controller.get();set("resumed",true);set("cloudSelected",true);set("category",PackagePresentation.NOT_INSTALLED);
        activity.getPreferences(0).edit().putString("registry_url","https://registry.test").apply();search=(EditText)get("browserSearch");
    }
    @After public void destroy(){Registry.oldRelease.countDown();if(!closed)controller.stop().destroy();}
    @Test public void typingDebouncesCloudRequestsAndKeepsKeyboardFocus()throws Exception{
        search.requestFocus();search.setText("n");search.setText("new");ShadowLooper.idleMainLooper(249,TimeUnit.MILLISECONDS);assertTrue(Registry.queries.isEmpty());
        ShadowLooper.idleMainLooper(1,TimeUnit.MILLISECONDS);await(()->Registry.queries.size()==1);await(this::idle);
        assertEquals(Collections.singletonList("new"),Registry.queries);assertTrue(search.hasFocus());assertTrue(all().stream().anyMatch(row->"new.app".equals(row.id)));
        search.setText("pending");controller.stop().destroy();closed=true;ShadowLooper.idleMainLooper(300,TimeUnit.MILLISECONDS);assertEquals(1,Registry.queries.size());
    }
    @Test public void olderCloudResultsCannotReplaceNewerSearchOrUsbSource()throws Exception{
        search.setText("old");ShadowLooper.idleMainLooper(250,TimeUnit.MILLISECONDS);await(()->Registry.oldStarted.getCount()==0);
        search.setText("new");ShadowLooper.idleMainLooper(250,TimeUnit.MILLISECONDS);await(this::idle);
        assertTrue(all().stream().anyMatch(row->"new.app".equals(row.id)));Registry.oldRelease.countDown();await(()->Thread.getAllStackTraces().keySet().stream().noneMatch(t->"nemesis-package-scan".equals(t.getName()) && t.isAlive()));ShadowLooper.idleMainLooper();assertFalse(all().stream().anyMatch(row->"old.app".equals(row.id)));
        Registry.oldStarted=new CountDownLatch(1);Registry.oldRelease=new CountDownLatch(1);search.setText("old");ShadowLooper.idleMainLooper(250,TimeUnit.MILLISECONDS);await(()->Registry.oldStarted.getCount()==0);
        set("cloudSelected",false);search.setText("");invoke("refreshBrowser");await(this::idle);Registry.oldRelease.countDown();await(()->Thread.getAllStackTraces().keySet().stream().noneMatch(t->"nemesis-package-scan".equals(t.getName()) && t.isAlive()));ShadowLooper.idleMainLooper();assertTrue(all().stream().noneMatch(row->row.remote!=null));
    }
    @Test public void installedSearchFiltersImmediatelyWithoutRegistryAccess()throws Exception{
        set("category",PackagePresentation.INSTALLED);invoke("refreshBrowser");await(this::idle);search.setText("demo");
        assertEquals(1,((List<?>)get("items")).size());search.setText("missing");assertTrue(((List<?>)get("items")).isEmpty());search.setText("");assertEquals(1,((List<?>)get("items")).size());
        ShadowLooper.idleMainLooper(300,TimeUnit.MILLISECONDS);assertTrue(Registry.queries.isEmpty());
    }
    private List<Spinner> spinners(View root){List<Spinner> result=new ArrayList<Spinner>();if(root instanceof Spinner)result.add((Spinner)root);if(root instanceof ViewGroup){ViewGroup group=(ViewGroup)root;for(int i=0;i<group.getChildCount();i++)result.addAll(spinners(group.getChildAt(i)));}return result;}
    @Test public void filterControlsApplyTypeAndOrderingAndResetRestoresAllRows()throws Exception{
        set("cloudSelected",false);
        for(String name:new String[]{"Alpha","Beta","Script"}){PackageScanner.Item row=new PackageScanner.Item();row.id=name;row.title=name;row.kind=name.equals("Script")?PackageScanner.EXECUTE:PackageScanner.INSTALL;all().add(row);}
        invoke("showBrowserFilters");AlertDialog dialog=(AlertDialog)ShadowDialog.getLatestDialog();List<Spinner> choices=spinners(dialog.getWindow().getDecorView());choices.get(0).setSelection(1);choices.get(1).setSelection(1);dialog.getButton(-1).performClick();ShadowLooper.idleMainLooper();
        List<PackageScanner.Item> visible=(List<PackageScanner.Item>)get("items");assertEquals(2,visible.size());assertEquals("Beta",visible.get(0).title);
        invoke("showBrowserFilters");dialog=(AlertDialog)ShadowDialog.getLatestDialog();dialog.getButton(-3).performClick();ShadowLooper.idleMainLooper();assertEquals(2,visible.size());assertEquals("Alpha",visible.get(0).title);assertEquals(0,get("browserType"));assertEquals(0,get("browserSort"));
        invoke("showBrowserFilters");((AlertDialog)ShadowDialog.getLatestDialog()).getButton(-2).performClick();ShadowLooper.idleMainLooper();assertEquals(2,visible.size());
    }
    @Test public void enterStartsSearchWithoutWaitingForDebounce()throws Exception{
        search.setText("enter");search.onEditorAction(android.view.inputmethod.EditorInfo.IME_ACTION_SEARCH);await(()->Registry.queries.size()==1);await(this::idle);assertEquals("enter",Registry.queries.get(0));
    }
    @Test public void physicalEnterSearchesImmediatelyButOtherImeActionsKeepDebounce()throws Exception{
        search.setText("done");search.onEditorAction(android.view.inputmethod.EditorInfo.IME_ACTION_DONE);assertTrue(Registry.queries.isEmpty());
        search.setText("physical");search.dispatchKeyEvent(new android.view.KeyEvent(android.view.KeyEvent.ACTION_DOWN,android.view.KeyEvent.KEYCODE_ENTER));await(()->Registry.queries.size()==1);await(this::idle);assertEquals("physical",Registry.queries.get(0));
    }
    @Test public void cloudScriptsRemainOfflineDuringSearch()throws Exception{
        set("category",PackagePresentation.SCRIPTS);invoke("refreshBrowser");await(this::idle);search.setText("script");ShadowLooper.idleMainLooper(300,TimeUnit.MILLISECONDS);assertTrue(Registry.queries.isEmpty());assertNull(get("scanError"));
    }
    @Test public void newerInputImmediatelyInvalidatesAnOldResponseBeforeDebounceRuns()throws Exception{
        search.setText("old");ShadowLooper.idleMainLooper(250,TimeUnit.MILLISECONDS);await(()->Registry.oldStarted.getCount()==0);
        search.setText("new");Registry.oldRelease.countDown();await(()->Thread.getAllStackTraces().keySet().stream().noneMatch(t->"nemesis-package-scan".equals(t.getName()) && t.isAlive()));
        assertTrue(all().isEmpty());assertNull(get("scanError"));assertEquals(1,Registry.queries.size());
        ShadowLooper.idleMainLooper(250,TimeUnit.MILLISECONDS);await(this::idle);assertTrue(all().stream().anyMatch(row->"new.app".equals(row.id)));
    }
    @Test public void filtersNeverHideDiscoveryErrors()throws Exception{
        search.setText("error");ShadowLooper.idleMainLooper(250,TimeUnit.MILLISECONDS);await(this::idle);
        assertTrue(((String)get("scanError")).contains("Network offline"));assertTrue(((android.widget.TextView)get("empty")).getText().toString().contains("Could not load"));
    }
    @Test public void newerInputImmediatelyDiscardsAnOldErrorBeforeDebounceRuns()throws Exception{
        search.setText("old-error");ShadowLooper.idleMainLooper(250,TimeUnit.MILLISECONDS);await(()->Registry.oldStarted.getCount()==0);
        search.setText("new");Registry.oldRelease.countDown();await(()->Thread.getAllStackTraces().keySet().stream().noneMatch(t->"nemesis-package-scan".equals(t.getName()) && t.isAlive()));
        assertNull(get("scanError"));assertEquals(1,Registry.queries.size());
        ShadowLooper.idleMainLooper(250,TimeUnit.MILLISECONDS);await(this::idle);assertTrue(all().stream().anyMatch(row->"new.app".equals(row.id)));
    }
    @Test public void installedDetailsOfferOnDemandManualVersionSelection()throws Exception{
        set("category",PackagePresentation.INSTALLED);invoke("refreshBrowser");await(this::idle);assertTrue(Registry.queries.isEmpty());
        PackageScanner.Item installed=all().get(0);installed.installedVersion="release-blue";set("selected",0);
        invoke("showDetails");android.app.Dialog details=ShadowDialog.getLatestDialog();
        List<View> pending=new ArrayList<View>();pending.add(details.getWindow().getDecorView());
        for(int i=0;i<pending.size();i++){View view=pending.get(i);if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int j=0;j<group.getChildCount();j++)pending.add(group.getChildAt(j));}if(view instanceof android.widget.TextView && "Choose version".contentEquals(((android.widget.TextView)view).getText())){view.performClick();break;}}
        await(this::idle);AlertDialog picker=(AlertDialog)ShadowDialog.getLatestDialog();assertEquals(1,picker.getListView().getAdapter().getCount());assertTrue(picker.getListView().getAdapter().getItem(0).toString().contains("release-red"));assertFalse((Boolean)get("busy"));
    }
    private void loadInstalledVersions()throws Exception {
        set("category",PackagePresentation.INSTALLED);invoke("refreshBrowser");await(this::idle);
        Method load=MainActivity.class.getDeclaredMethod("loadCloudVersions",PackageScanner.Item.class);load.setAccessible(true);load.invoke(activity,all().get(0));
    }
    private String dialogText(android.app.Dialog dialog){return dialog.getWindow().getDecorView().toString()+collectText(dialog.getWindow().getDecorView());}
    private String collectText(View view){String text=view instanceof android.widget.TextView?((android.widget.TextView)view).getText().toString():"";if(view instanceof ViewGroup){ViewGroup group=(ViewGroup)view;for(int i=0;i<group.getChildCount();i++)text+=collectText(group.getChildAt(i));}return text;}
    @Test public void onDemandVersionFailuresAndEmptyResultsKeepInstalledPackagesUsable()throws Exception {
        Registry.versionMode="error";loadInstalledVersions();await(this::idle);assertTrue(dialogText(ShadowDialog.getLatestDialog()).contains("Versions offline"));
        Registry.versionMode="empty";loadInstalledVersions();await(this::idle);assertTrue(dialogText(ShadowDialog.getLatestDialog()).contains("No published versions"));
        assertTrue(ActivityOperationsTest.Commands.calls.stream().noneMatch(call->call.get(0).equals("install")));assertTrue(all().get(0).installed);
    }
    @Test public void cancellingVersionDiscoveryDiscardsLateResults()throws Exception {
        Registry.versionMode="hold";loadInstalledVersions();await(()->Registry.oldStarted.getCount()==0);
        android.app.Dialog progress=ShadowDialog.getLatestDialog();progress.cancel();ShadowLooper.idleMainLooper();assertTrue(idle());Registry.oldRelease.countDown();
        await(()->Thread.getAllStackTraces().keySet().stream().noneMatch(t->"nemesis-version-discovery".equals(t.getName())&&t.isAlive()));
        assertTrue(all().stream().noneMatch(row->row.remote!=null));assertTrue(ActivityOperationsTest.Commands.calls.stream().noneMatch(call->call.get(0).equals("install")));
    }
}
