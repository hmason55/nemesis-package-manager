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
public class CloudSourceUiTest {
    private ActivityController<MainActivity> controller;
    private MainActivity activity;
    private void set(String name,Object value)throws Exception{Field f=MainActivity.class.getDeclaredField(name);f.setAccessible(true);f.set(activity,value);}
    private Object get(String name)throws Exception{Field f=MainActivity.class.getDeclaredField(name);f.setAccessible(true);return f.get(activity);}
    private void invoke(String name)throws Exception{Method m=MainActivity.class.getDeclaredMethod(name);m.setAccessible(true);m.invoke(activity);}
    private List<View> views(View root){List<View> result=new ArrayList<View>();result.add(root);if(root instanceof ViewGroup){ViewGroup g=(ViewGroup)root;for(int i=0;i<g.getChildCount();i++)result.addAll(views(g.getChildAt(i)));}return result;}
    @Before public void create()throws Exception{controller=Robolectric.buildActivity(MainActivity.class).create().start().visible();activity=controller.get();set("resumed",true);}
    @After public void destroy(){controller.stop().destroy();}
    private AlertDialog picker()throws Exception{invoke("chooseSource");return (AlertDialog)ShadowDialog.getLatestDialog();}
    @Test public void selectionCanBeRememberedAndChangedBackToUsb()throws Exception{
        AlertDialog dialog=picker();List<EditText> fields=new ArrayList<EditText>();RadioGroup group=null;CheckBox remember=null;
        for(View v:views(dialog.getWindow().getDecorView())){if(v instanceof EditText)fields.add((EditText)v);if(v instanceof RadioGroup)group=(RadioGroup)v;if(v instanceof CheckBox)remember=(CheckBox)v;}
        assertNotNull(group);assertNotNull(remember);group.check(1001);remember.setChecked(true);fields.get(0).setText("http://invalid.test");dialog.getButton(-1).performClick();assertTrue(dialog.isShowing());assertNotNull(fields.get(0).getError());
        fields.get(0).setText("https://registry.test");set("busy",true);dialog.getButton(-1).performClick();assertTrue(dialog.isShowing());set("busy",false);
        // Keep this UI test offline; refresh is separately covered by command shadows.
        set("destroyed",true);dialog.getButton(-1).performClick();assertEquals("cloud",activity.getPreferences(0).getString("source",""));assertTrue((Boolean)get("cloudSelected"));set("destroyed",false);
        dialog=picker();for(View v:views(dialog.getWindow().getDecorView())){if(v instanceof RadioGroup)((RadioGroup)v).check(1002);if(v instanceof CheckBox)((CheckBox)v).setChecked(false);}set("destroyed",true);dialog.getButton(-1).performClick();assertEquals("usb",activity.getPreferences(0).getString("source",""));assertTrue(activity.getPreferences(0).getBoolean("show_source_prompt",false));assertFalse((Boolean)get("cloudSelected"));set("destroyed",false);
    }
    @Test public void installedCloudVersionsAreDeduplicatedAndScriptsExplainUsb()throws Exception{
        set("cloudSelected",true);ArrayList<PackageScanner.Item> all=(ArrayList<PackageScanner.Item>)get("allItems");for(int i=0;i<2;i++){PackageScanner.Item item=new PackageScanner.Item();item.id="example.app";item.title="Example";item.installed=true;item.kind=PackageScanner.INSTALL;item.version="1."+i;all.add(item);}
        Method filter=MainActivity.class.getDeclaredMethod("filterItems",String.class);filter.setAccessible(true);filter.invoke(activity,new Object[]{null});assertEquals(1,((ArrayList<?>)get("items")).size());
        set("category",PackagePresentation.SCRIPTS);filter.invoke(activity,new Object[]{null});assertTrue(((TextView)get("empty")).getText().toString().contains("Settings"));
        all.clear();for(int category:new int[]{PackagePresentation.UPDATES,PackagePresentation.NOT_INSTALLED,PackagePresentation.INSTALLED}){set("category",category);filter.invoke(activity,new Object[]{null});assertFalse(((TextView)get("empty")).getText().toString().isEmpty());}
    }
    @Test public void settingsButtonSavesProfileAndCanRestoreStartupPrompt()throws Exception{
        TextView settings=null;for(View view:views(activity.getWindow().getDecorView()))if(view instanceof TextView && "Settings".contentEquals(((TextView)view).getText()))settings=(TextView)view;
        assertNotNull(settings);settings.performClick();AlertDialog dialog=(AlertDialog)ShadowDialog.getLatestDialog();assertTrue(dialog.isShowing());
        for(View view:views(dialog.getWindow().getDecorView())){
            if(view instanceof EditText){String label=String.valueOf(view.getContentDescription());if(label.startsWith("Vehicle model"))((EditText)view).setText("IONIQ 5");if(label.startsWith("Firmware version"))((EditText)view).setText("260507");if(label.startsWith("NEMESIS version"))((EditText)view).setText("1.0");}
            if(view instanceof CheckBox)((CheckBox)view).setChecked(true);
        }
        set("destroyed",true);dialog.getButton(-1).performClick();set("destroyed",false);
        assertEquals("IONIQ 5",activity.getPreferences(0).getString("device_vehicle",""));assertEquals("260507",activity.getPreferences(0).getString("device_firmware",""));assertEquals("1.0",activity.getPreferences(0).getString("device_nemesis",""));assertFalse(activity.getPreferences(0).getBoolean("show_source_prompt",true));
        dialog=picker();for(View view:views(dialog.getWindow().getDecorView()))if(view instanceof CheckBox)((CheckBox)view).setChecked(false);
        set("destroyed",true);dialog.getButton(-1).performClick();set("destroyed",false);assertTrue(activity.getPreferences(0).getBoolean("show_source_prompt",false));
    }
}
