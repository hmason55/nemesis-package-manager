package dev.nemesis.usbmanager;

import android.app.*;
import android.view.*;
import android.widget.*;
import java.io.*;
import java.lang.reflect.*;
import java.util.*;
import java.util.concurrent.TimeUnit;
import org.junit.*;
import org.junit.runner.RunWith;
import org.robolectric.*;
import org.robolectric.annotation.*;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.shadows.*;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=19,manifest=Config.NONE,shadows={CloudInstallUiTest.Downloads.class})
@LooperMode(LooperMode.Mode.PAUSED)
public class CloudInstallUiTest {
    private ActivityController<MainActivity> controller;private MainActivity activity;private PackageScanner.Item item;
    @Implements(value=CloudPackageSource.class,isInAndroidSdk=false)
    public static class Downloads {
        static boolean fail,cancel;
        @Implementation protected PackageScanner.Item acquire(PackageRecord record,PackageSource.Progress progress)throws Exception{
            assertFalse(progress.cancelled());progress.update(50,100);
            if(fail)throw new IOException("Network unavailable");
            if(cancel)throw new IOException("Download cancelled");
            return CloudPackageSource.item(record,new File("/cache/verified.zip"));
        }
    }
    private void set(String name,Object value)throws Exception{Field field=MainActivity.class.getDeclaredField(name);field.setAccessible(true);field.set(activity,value);}
    private Object get(String name)throws Exception{Field field=MainActivity.class.getDeclaredField(name);field.setAccessible(true);return field.get(activity);}
    private void invoke(String name)throws Exception{Method method=MainActivity.class.getDeclaredMethod(name);method.setAccessible(true);method.invoke(activity);}
    private List<TextView> texts(View root){List<TextView> result=new ArrayList<TextView>();if(root instanceof TextView)result.add((TextView)root);if(root instanceof ViewGroup){ViewGroup group=(ViewGroup)root;for(int i=0;i<group.getChildCount();i++)result.addAll(texts(group.getChildAt(i)));}return result;}
    @Before public void create()throws Exception{
        Downloads.fail=false;Downloads.cancel=false;controller=Robolectric.buildActivity(MainActivity.class).create().start().visible();activity=controller.get();activity.getPreferences(0).edit().putString("registry_url","https://registry.test").putString("profile","IONIQ 5 / 260507").apply();set("resumed",true);
        PackageRecord record=new PackageRecord();record.id="example.app";record.name="Example";record.version="1.2";record.compatibility="Firmware: different firmware";record.publisher="publisher";record.repository="owner/repo";record.sha256="0".repeat(64);record.description="Description";
        item=CloudPackageSource.item(record,null);((ArrayList<PackageScanner.Item>)get("items")).add(item);set("selected",0);set("category",PackagePresentation.NOT_INSTALLED);
    }
    @After public void destroy(){controller.stop().destroy();}
    private Dialog awaitResult()throws Exception{
        for(int i=0;i<100;i++){ShadowLooper.idleMainLooper(10,TimeUnit.MILLISECONDS);if(!(Boolean)get("busy"))return ShadowDialog.getLatestDialog();Thread.sleep(10);}throw new AssertionError("Download did not finish");
    }
    @Test public void downloadRequiresSeparateInstallConfirmationAndShowsAdvisoryMismatch()throws Exception{
        ((ArrayList<PackageScanner.Item>)get("allItems")).add(item);invoke("showDetails");Dialog details=ShadowDialog.getLatestDialog();
        for(TextView view:texts(details.getWindow().getDecorView()))if("Choose version".equals(view.getText().toString()))view.performClick();
        AlertDialog picker=(AlertDialog)ShadowDialog.getLatestDialog();picker.getListView().performItemClick(null,0,0);
        Dialog result=awaitResult();StringBuilder text=new StringBuilder();for(TextView view:texts(result.getWindow().getDecorView()))text.append(view.getText()).append('\n');
        assertTrue(text.toString().contains("Download verified"));assertTrue(text.toString().contains("different firmware"));assertTrue(text.toString().contains("Compatibility is advisory"));assertTrue(text.toString().contains("IONIQ 5 / 260507"));
        assertEquals("cloud:example.app:1.2",PackagePresentation.key(item));assertTrue(PackagePresentation.details(item).contains("Publisher: publisher"));assertTrue(PackagePresentation.details(item).contains("Source: Cloud Registry"));
    }
    @Test public void failedDownloadsShowResultWithoutStartingInstaller()throws Exception{
        Downloads.fail=true;invoke("chooseAction");Dialog result=awaitResult();StringBuilder text=new StringBuilder();for(TextView view:texts(result.getWindow().getDecorView()))text.append(view.getText());assertTrue(text.toString().contains("Download not completed"));assertTrue(text.toString().contains("Network unavailable"));
    }
    @Test public void versionPickerKeepsIncomparableInstalledVersionsManuallySelectable()throws Exception{
        ArrayList<PackageScanner.Item> all=(ArrayList<PackageScanner.Item>)get("allItems");
        item.installed=true;item.installedVersion="release-blue";item.version="release-red";item.remote.version=item.version;all.add(item);
        all.add(new PackageScanner.Item());PackageRecord other=new PackageRecord();other.id="other.app";other.name="Other";other.version="1";all.add(CloudPackageSource.item(other,null));
        Method picker=MainActivity.class.getDeclaredMethod("chooseCloudVersion",String.class);picker.setAccessible(true);picker.invoke(activity,item.id);
        AlertDialog dialog=(AlertDialog)ShadowDialog.getLatestDialog();assertEquals(1,dialog.getListView().getAdapter().getCount());dialog.getListView().performItemClick(null,0,0);assertNotNull(awaitResult());
        item.version=item.installedVersion;item.remote.version=item.version;picker.invoke(activity,item.id);dialog=(AlertDialog)ShadowDialog.getLatestDialog();dialog.getListView().performItemClick(null,0,0);
        assertFalse((Boolean)get("busy"));
    }
}
