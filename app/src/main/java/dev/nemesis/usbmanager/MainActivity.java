package dev.nemesis.usbmanager;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.DialogInterface;
import android.os.Bundle;
import android.os.Handler;
import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.view.WindowManager;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.HashMap;
import java.util.Map;
import java.util.Set;

/** KitKat-compatible installed NEMESIS app. Does not alter NEMESIS itself. */
public final class MainActivity extends Activity {
    private File usb;
    private final ArrayList<PackageScanner.Item> items = new ArrayList<PackageScanner.Item>();
    private TextView status;
    private ListView list;
    private int selected = -1;
    private Button action;
    private Button folder;
    private Button uninstall;
    private Button launch;
    private volatile boolean busy;
    private static final OperationCoordinator operations = new OperationCoordinator();
    private final Handler handler = new Handler();
    private boolean resumed;
    private final Runnable monitorOperation = new Runnable() {
        public void run() {
            if (!resumed) return;
            updateButtons();
            if (operations.isRunning()) {
                status.setText("Package operation in progress. Do not remove USB.");
                handler.postDelayed(this, 500);
            } else {
                OperationCoordinator.Completion result = operations.takeCompletion();
                if (result != null) message(result.success ? "Completed" : "Failed", result.output);
                refresh();
            }
        }
    };

    @Override protected void onResume() {
        super.onResume();
        resumed = true;
        monitorOperation.run();
    }
    @Override protected void onPause() {
        resumed = false;
        handler.removeCallbacks(monitorOperation);
        super.onPause();
    }
    private final int BG = Color.rgb(20, 24, 30);
    private final int PANEL = Color.rgb(38, 45, 55);
    private final int TEXT = Color.rgb(235, 238, 244);
    private final int MUTED = Color.rgb(165, 178, 197);

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        // No screen-on override: the head unit keeps its normal power behavior.
        buildUi();
        refresh();
    }
    private int dp(float v) { return Math.round(v * getResources().getDisplayMetrics().density); }
    private Button button(String text) {
        Button b = new Button(this); b.setText(text);
        b.setAllCaps(false); b.setTextColor(TEXT); b.setBackgroundColor(PANEL);
        b.setPadding(dp(10),dp(8),dp(10),dp(8));
        return b;
    }
    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL); root.setPadding(dp(18),dp(12),dp(18),dp(14)); root.setBackgroundColor(BG);
        TextView title = new TextView(this);
        title.setText("USB Package Manager"); title.setTextSize(24); title.setTypeface(Typeface.DEFAULT, Typeface.BOLD); title.setTextColor(TEXT);
        root.addView(title, new LinearLayout.LayoutParams(-1, -2));
        status = new TextView(this); status.setTextSize(13); status.setTextColor(MUTED);
        root.addView(status, new LinearLayout.LayoutParams(-1, -2));
        list = new ListView(this); list.setChoiceMode(ListView.CHOICE_MODE_SINGLE); list.setDividerHeight(dp(2));
        root.addView(list, new LinearLayout.LayoutParams(-1, 0, 1));
        list.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            public void onItemClick(AdapterView<?> parent, View view, int position, long id) {
                selected = position; updateButtons();
            }
        });
        LinearLayout bar = new LinearLayout(this); bar.setOrientation(LinearLayout.HORIZONTAL);
        bar.setPadding(0,dp(8),0,0);
        action = button("Install / Run");
        launch = button("Launch");
        uninstall = button("Uninstall");
        folder = button("Data folder");
        Button refresh = button("Refresh");
        Button close = button("Close");
        bar.addView(action,new LinearLayout.LayoutParams(0, dp(56), 2));
        bar.addView(launch,new LinearLayout.LayoutParams(0, dp(56), 1));
        bar.addView(uninstall,new LinearLayout.LayoutParams(0, dp(56), 1));
        bar.addView(folder,new LinearLayout.LayoutParams(0,dp(56),1));
        bar.addView(refresh,new LinearLayout.LayoutParams(0,dp(56),1));
        bar.addView(close,new LinearLayout.LayoutParams(0,dp(56),1));
        root.addView(bar);
        setContentView(root);
        action.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { chooseAction(); } });
        folder.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { dataFolder(); } });
        uninstall.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { confirmUninstall(); } });
        launch.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { confirmLaunch(); } });
        refresh.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { refresh(); } });
        close.setOnClickListener(new View.OnClickListener() { public void onClick(View v) { finish(); } });
        updateButtons();
    }
    private void updateButtons() {
        boolean unavailable = busy || operations.isRunning();
        boolean chosen = selected >= 0 && selected < items.size();
        PackageScanner.Item item = chosen ? items.get(selected) : null;
        action.setEnabled(!unavailable && chosen && !PackageScanner.BROKEN.equals(item.kind) && !"installed".equals(item.kind) && !item.locked &&
            (item.installedStateKnown || PackageScanner.EXECUTE.equals(item.kind)));
        launch.setEnabled(!unavailable && chosen && item.installedStateKnown && item.installed && item.id != null);
        uninstall.setEnabled(!unavailable && chosen && item.installedStateKnown && item.installed && !item.locked && item.id != null);
        folder.setEnabled(!unavailable && chosen && item.dataDir() != null);
    }
    private void refresh() {
        if (busy || operations.isRunning()) return;
        busy = true;
        selected = -1; updateButtons();
        status.setText("Scanning USB and installed NEMESIS packages...");
        new Thread(new Runnable() {
            public void run() {
                final File nextUsb = PackageScanner.findUsbRoot();
                final ArrayList<PackageScanner.Item> next = PackageScanner.scan(nextUsb);
                NemesisCli.Result query = NemesisCli.run("pkg-list");
                final InstalledPackages registry = InstalledPackages.parse(query.rc, query.out);
                final Map<String, String> names = registry.names;
                final Set<String> locked = registry.locked;
                final Set<String> seen = new HashSet<String>();
                for (PackageScanner.Item item : next) {
                    item.installedStateKnown = registry.available();
                    item.installed = item.id != null && names.containsKey(item.id);
                    item.locked = item.id != null && locked.contains(item.id);
                    if (item.id != null) seen.add(item.id);
                }
                for (String id : names.keySet()) {
                    if (seen.contains(id)) continue;
                    PackageScanner.Item item = new PackageScanner.Item();
                    item.kind = "installed"; item.id = id; item.installed = true;
                    item.locked = locked.contains(id);
                    item.title = names.get(id); item.detail = "Installed on head unit (no matching USB installer)";
                    next.add(item);
                }
                runOnUiThread(new Runnable() {
                    public void run() {
                        usb = nextUsb; items.clear(); items.addAll(next); selected = -1;
                        ArrayList<String> labels = new ArrayList<String>();
                        for (PackageScanner.Item item : items) {
                            String label = item.label() + (item.locked ? "  LOCKED" : "");
                            if (item.error != null) label += "\n" + item.error;
                            else label += "\n" + (item.folder == null ? "Head unit" : item.folder.getName()) +
                                " / " + (item.id == null ? "script" : item.id);
                            labels.add(label);
                        }
                        list.setAdapter(new ArrayAdapter<String>(MainActivity.this, android.R.layout.simple_list_item_activated_1, labels));
                        status.setText(!registry.available() ? registry.error :
                            (usb == null ? "USB/packages not detected; showing installed packages" :
                            usb.getAbsolutePath() + "/packages/ | " + items.size() + " entries"));
                        busy = false; updateButtons();
                    }
                });
            }
        }).start();
    }

    private void chooseAction() {
        if (selected < 0 || selected >= items.size() || busy || operations.isRunning()) return;
        final PackageScanner.Item item = items.get(selected);
        if (!item.installedStateKnown && !PackageScanner.EXECUTE.equals(item.kind)) return;
        final String verb = PackageScanner.EXECUTE.equals(item.kind) ? "RUN SCRIPT" :
            (item.installed ? "UPDATE PACKAGE" : "INSTALL PACKAGE");
        String warning = "Selected: " + item.title + "\n" + item.detail +
            "\n\nNEMESIS runs package installation hooks and USB scripts with ROOT privileges. " +
            "Install or run only packages from sources you trust.\n\n" +
            "This manager does not modify the USB root descriptor or erase package data.";
        if (item.locked) { message("Locked", "NEMESIS reports this package is locked; it cannot be updated."); return; }
        new AlertDialog.Builder(this).setTitle(verb).setMessage(warning)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Confirm", new DialogInterface.OnClickListener() {
                public void onClick(DialogInterface dialog, int which) { perform(item); }
            }).show();
    }
    private void perform(final PackageScanner.Item item) {
        startOperation(item, null);
    }
    private void confirmUninstall() {
        if (selected < 0 || selected >= items.size() || busy) return;
        final PackageScanner.Item item = items.get(selected);
        if (!item.installed || item.locked || !PackageScanner.validId(item.id)) return;
        new AlertDialog.Builder(this).setTitle("Uninstall " + item.id + "?")
            .setMessage("This runs the package's uninstall hooks as ROOT. It may reboot or modify system files. " +
                "USB package folders and their data/ directories will not be deleted. Proceed only if this package's documentation confirms safe removal.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Uninstall", new DialogInterface.OnClickListener() {
                public void onClick(DialogInterface dialog, int which) { performCommand(item, "uninstall"); }
            }).show();
    }
    private void confirmLaunch() {
        if (selected < 0 || selected >= items.size() || busy) return;
        final PackageScanner.Item item = items.get(selected);
        if (!item.installed || !PackageScanner.validId(item.id)) return;
        new AlertDialog.Builder(this).setTitle("Launch " + item.id + "?")
            .setMessage("Launch the installed package on the head unit?")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Launch", new DialogInterface.OnClickListener() {
                public void onClick(DialogInterface dialog, int which) { performCommand(item, "pkg-launch"); }
            }).show();
    }
    private void performCommand(final PackageScanner.Item item, final String command) {
        startOperation(item, command);
    }
    private void startOperation(PackageScanner.Item item, String command) {
        if (busy || !operations.start(new PackageTask(getApplicationContext(), item, command))) {
            message("Busy", "A package operation is already in progress or awaiting its result.");
            return;
        }
        handler.removeCallbacks(monitorOperation);
        monitorOperation.run();
    }
    // A worker must not retain an activity or call its dialogs after it closes.
    private static final class PackageTask implements OperationCoordinator.Task {
        private final Context context;
        private final PackageScanner.Item item;
        private final String command;
        PackageTask(Context context, PackageScanner.Item item, String command) {
            this.context = context; this.item = item; this.command = command;
        }
        public OperationCoordinator.Completion run() {
            NemesisCli.Result result = command != null ? NemesisCli.run(command, item.id) :
                (PackageScanner.EXECUTE.equals(item.kind) ? NemesisCli.execute(item) : NemesisCli.install(context, item));
            String log = (command == null ? "" : "Operation: " + command + "\n") +
                "Return code: " + result.rc + "\n" + result.out;
            writeActionLog(item, log);
            return new OperationCoordinator.Completion(result.rc == 0, log);
        }
    }
    private void dataFolder() {
        if (selected < 0 || selected >= items.size()) return;
        final PackageScanner.Item item = items.get(selected);
        File data = item.dataDir();
        if (data == null) return;
        // No redirection of another application's output occurs here.
        if (!data.isDirectory() && !data.mkdirs()) {
            message("USB write error", "Could not create: " + data.getAbsolutePath()); return;
        }
        String content = "Persistent data folder:\n" + data.getAbsolutePath() + "\n\n" +
            "This folder is not deleted by the manager. Apps must be configured to write here.\n\n" +
            (item.title.toLowerCase().contains("dashcam") || item.folder.getName().toLowerCase().contains("dashcam") ?
            "RearDashcam supports a --out option in /data/nemesis/apps/dashcam/dashcam.conf. " +
            "Its default is /storage/usb0/Dashcam. Changing its output requires separate configuration and testing; updates may replace dashcam.conf." :
            "Check the package's own documentation for its configurable output directory.");
        message("App data", content);
    }
    private static void writeActionLog(PackageScanner.Item item, String result) {
        try {
            File dir = item.dataDir();
            if (dir == null) return;
            if (!dir.isDirectory() && !dir.mkdirs()) return;
            FileOutputStream out = new FileOutputStream(new File(dir,"package-manager-history.log"), true);
            try { out.write(("\n=== " + new java.util.Date().toString() + " : " + item.title + " ===\n" +
                (result.length() > 32000 ? result.substring(0, 32000) : result) + "\n").getBytes("UTF-8")); }
            finally { out.close(); }
        } catch (Exception ignored) { }
    }
    private void message(String title, String body) {
        ScrollView scroll = new ScrollView(this);
        TextView text = new TextView(this); text.setTextColor(TEXT); text.setTextSize(15);
        text.setPadding(dp(20),dp(16),dp(20),dp(16)); text.setText(body);
        scroll.addView(text);
        new AlertDialog.Builder(this).setTitle(title).setView(scroll).setPositiveButton("OK", null).show();
    }
}
