package dev.nemesis.usbmanager;

import android.app.Activity;
import android.app.Dialog;
import android.content.Context;
import android.os.Bundle;
import android.os.Handler;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.StateListDrawable;
import android.graphics.drawable.ColorDrawable;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.BaseAdapter;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ListView;
import android.widget.TextView;
import android.widget.ProgressBar;
import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Set;

/** KitKat-compatible installed NEMESIS app. Does not alter NEMESIS itself. */
public final class MainActivity extends Activity {
    private final ArrayList<PackageScanner.Item> items = new ArrayList<PackageScanner.Item>();
    private final ArrayList<Dialog> dialogs = new ArrayList<Dialog>();
    private TextView status;
    private TextView empty;
    private ListView list;
    private PackageAdapter adapter;
    private int selected = -1;
    private Button action;
    private Button details;
    private Button uninstall;
    private Button launch;
    private Button refreshButton;
    private boolean busy;
    private ProgressBar progress;
    private boolean destroyed;
    private static final OperationCoordinator operations = new OperationCoordinator();
    private final Handler handler = new Handler();
    private boolean resumed;
    private final int BG = ManagerDialogs.BACKGROUND;
    private final int PANEL = ManagerDialogs.PANEL;
    private final int TEXT = ManagerDialogs.TEXT;
    private final int MUTED = Color.rgb(165, 178, 197);
    private final Runnable monitorOperation = new Runnable() {
        public void run() {
            if (!resumed || destroyed || isFinishing()) return;
            updateButtons();
            if (operations.isRunning()) {
                status.setText(operations.description() + " in progress. Do not remove USB.");
                handler.postDelayed(this, 500);
            } else {
                final OperationCoordinator.Completion result = operations.takeCompletion();
                if (result != null) {
                    showResult(result);
                    updateButtons();
                }
                refresh();
            }
        }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        buildUi();
    }
    @Override protected void onResume() {
        super.onResume();
        resumed = true;
        handler.removeCallbacks(monitorOperation);
        monitorOperation.run();
    }
    @Override protected void onPause() {
        resumed = false;
        handler.removeCallbacks(monitorOperation);
        super.onPause();
    }
    @Override protected void onDestroy() {
        destroyed = true;
        handler.removeCallbacks(monitorOperation);
        for (Dialog dialog : new ArrayList<Dialog>(dialogs)) dialog.dismiss();
        dialogs.clear();
        super.onDestroy();
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private Button button(String text) {
        Button button = new Button(this);
        button.setText(text); button.setAllCaps(false); button.setTextColor(TEXT);
        button.setBackgroundColor(PANEL); button.setPadding(dp(12), dp(8), dp(12), dp(8));
        return button;
    }
    private TextView text(String value, int size, int color) {
        TextView text = new TextView(this);
        text.setText(value); text.setTextSize(size); text.setTextColor(color);
        return text;
    }
    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL); root.setPadding(dp(18), dp(12), dp(18), dp(14)); root.setBackgroundColor(BG);
        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = text("Package Manager", 24, TEXT);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        header.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        refreshButton = button("Refresh");
        Button close = button("Close");
        header.addView(refreshButton, new LinearLayout.LayoutParams(-2, dp(52)));
        header.addView(close, new LinearLayout.LayoutParams(-2, dp(52)));
        root.addView(header);
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progress.setIndeterminate(true);
        progress.setContentDescription("Package operation in progress");
        progress.setVisibility(View.GONE);
        root.addView(progress, new LinearLayout.LayoutParams(-1, dp(6)));
        status = text("Loading packages…", 14, MUTED);
        status.setMaxLines(3); status.setEllipsize(TextUtils.TruncateAt.END);
        status.setOnClickListener(new View.OnClickListener() {
            public void onClick(View view) { message("Status", status.getText().toString()); }
        });
        status.setPadding(0, dp(6), 0, dp(8));
        root.addView(status, new LinearLayout.LayoutParams(-1, -2));
        empty = text("", 18, MUTED); empty.setGravity(Gravity.CENTER);
        root.addView(empty, new LinearLayout.LayoutParams(-1, 0, 1));
        list = new ListView(this); list.setDividerHeight(dp(2));
        adapter = new PackageAdapter(); list.setAdapter(adapter); list.setEmptyView(empty);
        root.addView(list, new LinearLayout.LayoutParams(-1, 0, 1));
        list.setOnItemClickListener(new AdapterView.OnItemClickListener() {
            public void onItemClick(AdapterView<?> parent, View view, int position, long id) {
                selected = position; adapter.notifyDataSetChanged(); updateButtons();
            }
        });
        LinearLayout bar = new LinearLayout(this);
        bar.setPadding(0, dp(8), 0, 0);
        action = button("Install"); launch = button("Launch"); uninstall = button("Uninstall"); details = button("Details");
        bar.addView(action, new LinearLayout.LayoutParams(0, dp(56), 1));
        bar.addView(launch, new LinearLayout.LayoutParams(0, dp(56), 1));
        bar.addView(uninstall, new LinearLayout.LayoutParams(0, dp(56), 1));
        bar.addView(details, new LinearLayout.LayoutParams(0, dp(56), 1));
        root.addView(bar); setContentView(root);
        action.setOnClickListener(new View.OnClickListener() { public void onClick(View view) { chooseAction(); } });
        details.setOnClickListener(new View.OnClickListener() { public void onClick(View view) { showDetails(); } });
        uninstall.setOnClickListener(new View.OnClickListener() { public void onClick(View view) { confirmUninstall(); } });
        launch.setOnClickListener(new View.OnClickListener() { public void onClick(View view) { confirmLaunch(); } });
        refreshButton.setOnClickListener(new View.OnClickListener() { public void onClick(View view) { refresh(); } });
        close.setOnClickListener(new View.OnClickListener() { public void onClick(View view) { finish(); } });
        updateButtons();
    }
    private PackageScanner.Item selection() {
        return selected >= 0 && selected < items.size() ? items.get(selected) : null;
    }
    private boolean unavailable() { return busy || operations.isRunning(); }
    private void updateButtons() {
        progress.setVisibility(unavailable() ? View.VISIBLE : View.GONE);
        PackageScanner.Item item = selection();
        boolean ready = !unavailable() && item != null;
        action.setText(PackagePresentation.action(item));
        action.setEnabled(ready && (!PackagePresentation.isManager(item) || item.installed) && !PackageScanner.BROKEN.equals(item.kind) && !"installed".equals(item.kind) && !item.locked &&
            (item.installedStateKnown || PackageScanner.EXECUTE.equals(item.kind)));
        launch.setEnabled(ready && PackagePresentation.canLaunch(item));
        uninstall.setEnabled(ready && PackagePresentation.canUninstall(item));
        details.setEnabled(ready);
        refreshButton.setEnabled(!unavailable());
        for (Button button : new Button[] { action, launch, uninstall, details, refreshButton })
            button.setAlpha(button.isEnabled() ? 1f : 0.45f);
    }
    private void refresh() {
        if (unavailable() || destroyed) return;
        final PackageScanner.Item previous = selection();
        final String previousKey = previous == null ? null : PackagePresentation.key(previous);
        busy = true; updateButtons();
        status.setText("Scanning USB and installed packages…");
        empty.setText("Scanning for packages…");
        new Thread(new Runnable() {
            public void run() {
                try {
                    final File usb = PackageScanner.findUsbRoot();
                    final ArrayList<PackageScanner.Item> next = PackageScanner.scan(usb);
                    NemesisCli.Result query = NemesisCli.run("pkg-list");
                    final InstalledPackages registry = InstalledPackages.parse(query.rc, query.out);
                    Set<String> seen = new HashSet<String>();
                    for (PackageScanner.Item item : next) {
                        item.installedStateKnown = registry.available();
                        item.installed = item.id != null && registry.names.containsKey(item.id);
                        item.locked = item.id != null && registry.locked.contains(item.id);
                        if (item.installed) item.types = registry.types.get(item.id);
                        if (item.id != null) seen.add(item.id);
                    }
                    for (String id : registry.names.keySet()) {
                        if (seen.contains(id)) continue;
                        PackageScanner.Item item = new PackageScanner.Item();
                        item.kind = "installed"; item.id = id; item.installed = true;
                        item.locked = registry.locked.contains(id); item.types = registry.types.get(id);
                        item.title = registry.names.get(id);
                        next.add(item);
                    }
                    Collections.sort(next, new Comparator<PackageScanner.Item>() {
                        public int compare(PackageScanner.Item a, PackageScanner.Item b) {
                            int name = PackagePresentation.name(a).compareToIgnoreCase(PackagePresentation.name(b));
                            return name == 0 ? PackagePresentation.key(a).compareTo(PackagePresentation.key(b)) : name;
                        }
                    });
                    runOnUiThread(new Runnable() {
                        public void run() {
                            if (destroyed) return;
                            items.clear(); items.addAll(next); selected = -1;
                            for (int i = 0; i < items.size(); i++)
                                if (PackagePresentation.key(items.get(i)).equals(previousKey)) { selected = i; break; }
                            adapter.notifyDataSetChanged();
                            if (selected >= 0) list.setSelection(selected);
                            status.setText(!registry.available() ? registry.error :
                                (usb == null ? "No USB installers detected · " + items.size() + " installed packages" :
                                items.size() + " packages"));
                            empty.setText(!registry.available() ? "Installed packages could not be loaded.\nCheck the error above, then tap Refresh." :
                                (usb == null ? "No packages found.\nInsert a USB drive with a packages/ folder, then tap Refresh." :
                                "No packages found.\nAdd a release under packages/ on your USB, then tap Refresh."));
                            busy = false; updateButtons();
                        }
                    });
                } catch (final Exception error) {
                    runOnUiThread(new Runnable() {
                        public void run() {
                            if (destroyed) return;
                            items.clear(); selected = -1; adapter.notifyDataSetChanged();
                            status.setText("Could not scan packages: " + error.toString());
                            empty.setText("Check the USB drive, then tap Refresh to retry.");
                            busy = false; updateButtons();
                        }
                    });
                }
            }
        }, "nemesis-package-scan").start();
    }
    private final class PackageAdapter extends BaseAdapter {
        public int getCount() { return items.size(); }
        public Object getItem(int position) { return items.get(position); }
        public long getItemId(int position) { return position; }
        public View getView(int position, View recycled, ViewGroup parent) {
            LinearLayout row;
            if (recycled instanceof LinearLayout) row = (LinearLayout) recycled;
            else {
                row = new LinearLayout(MainActivity.this); row.setOrientation(LinearLayout.VERTICAL);
                row.setPadding(dp(16), dp(12), dp(16), dp(12)); row.setMinimumHeight(dp(78));
                TextView title = text("", 20, TEXT); title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
                title.setSingleLine(true); title.setEllipsize(TextUtils.TruncateAt.END);
                row.addView(title, new LinearLayout.LayoutParams(-1, -2));
                TextView subtitle = text("", 15, MUTED);
                subtitle.setSingleLine(true); subtitle.setEllipsize(TextUtils.TruncateAt.END);
                row.addView(subtitle, new LinearLayout.LayoutParams(-1, -2));
            }
            PackageScanner.Item item = items.get(position);
            ((TextView) row.getChildAt(0)).setText(PackagePresentation.name(item));
            ((TextView) row.getChildAt(1)).setText(PackagePresentation.subtitle(item));
            StateListDrawable background = new StateListDrawable();
            background.addState(new int[] { android.R.attr.state_pressed }, new ColorDrawable(Color.rgb(62, 82, 108)));
            background.addState(new int[0], new ColorDrawable(position == selected ? Color.rgb(45, 65, 90) : PANEL));
            row.setBackground(background);
            return row;
        }
    }
    private void chooseAction() {
        final PackageScanner.Item item = selection();
        if (item == null || unavailable() || (PackagePresentation.isManager(item) && !item.installed) || item.locked || PackageScanner.BROKEN.equals(item.kind) || "installed".equals(item.kind)) return;
        if (!item.installedStateKnown && !PackageScanner.EXECUTE.equals(item.kind)) return;
        String action = PackagePresentation.action(item);
        confirm(action + " " + PackagePresentation.name(item) + "?",
            "NEMESIS runs installation hooks and USB scripts with root privileges. Only continue if you trust this package and have checked its compatibility.\n\n" +
            (PackagePresentation.isManager(item) ? "Package Manager will close and reopen while NEMESIS installs the update." : "Your installer and data folder will be kept."), action, new Runnable() {
                public void run() { startOperation(item, null); }
            });
    }
    private void confirmUninstall() {
        final PackageScanner.Item item = selection();
        if (unavailable() || !PackagePresentation.canUninstall(item)) return;
        confirm("Uninstall " + PackagePresentation.name(item) + "?",
            "This removes the installed package from the head unit and runs its uninstall hooks as root. Follow the package's removal instructions.\n\n" +
            "The installer and data on your USB will be kept.", "Uninstall", new Runnable() {
                public void run() { startOperation(item, "uninstall"); }
            });
    }
    private void confirmLaunch() {
        final PackageScanner.Item item = selection();
        if (item == null || unavailable() || !PackagePresentation.canLaunch(item)) return;
        confirm("Launch " + PackagePresentation.name(item) + "?", "Open the installed package on the head unit?", "Launch", new Runnable() {
            public void run() { startOperation(item, "pkg-launch"); }
        });
    }
    private void startOperation(PackageScanner.Item item, String command) {
        if (PackagePresentation.isManager(item) && !("pkg-launch".equals(command) || (command == null && item.installed))) {
            message("Use NEMESIS", "Install, update, or uninstall Package Manager using NEMESIS's package installer and Packages screen.");
            return;
        }
        String description = (command == null ? PackagePresentation.action(item) :
            ("uninstall".equals(command) ? "Uninstall" : "Launch")) + " · " + PackagePresentation.name(item);
        if (unavailable() || !operations.start(description, new PackageTask(getApplicationContext(), item, command))) {
            message("Operation in progress", "Wait for the current operation and its result before starting another.");
            return;
        }
        handler.removeCallbacks(monitorOperation); monitorOperation.run();
    }
    private static final class PackageTask implements OperationCoordinator.Task {
        private final Context context;
        private final PackageScanner.Item item;
        private final String command;
        PackageTask(Context context, PackageScanner.Item item, String command) {
            this.context = context; this.item = item; this.command = command;
        }
        public OperationCoordinator.Completion run() {
            String operation = PackagePresentation.operation(item, command);
            NemesisCli.Result result;
            try {
                result = command == null && PackagePresentation.isManager(item) ? NemesisCli.updateManager(item) : command != null ? NemesisCli.run(command, item.id) :
                    (PackageScanner.EXECUTE.equals(item.kind) ? NemesisCli.execute(item) : NemesisCli.install(context, item));
            } catch (Exception error) { result = new NemesisCli.Result(1, error.toString()); }
            if (result.operation != null) operation = result.operation;
            OperationCoordinator.Completion completion = PackagePresentation.completion(item, operation, result.rc, result.out);
            String logError = writeActionLog(item, completion.details);
            if (logError != null) return new OperationCoordinator.Completion(completion.success, completion.title,
                completion.output + "\n\nHistory could not be saved. Open Details for the reason.", completion.details + "\n\n" + logError);
            return completion;
        }
    }
    private void showDetails() {
        PackageScanner.Item item = selection();
        if (item != null && !unavailable()) message(PackagePresentation.name(item), PackagePresentation.details(item));
    }
    private static String writeActionLog(PackageScanner.Item item, String result) {
        File dir = item.dataDir();
        if (dir == null) return null;
        try {
            if (!dir.isDirectory() && !dir.mkdirs()) return "Could not create history folder: " + dir.getAbsolutePath();
            FileOutputStream out = new FileOutputStream(new File(dir, "package-manager-history.log"), true);
            try { out.write(("\n=== " + new java.util.Date().toString() + " : " + PackagePresentation.name(item) + " ===\n" +
                (result.length() > 32000 ? result.substring(0, 32000) : result) + "\n").getBytes("UTF-8")); }
            finally { out.close(); }
            return null;
        } catch (Exception error) { return "Could not save history: " + error.toString(); }
    }
    private void showResult(final OperationCoordinator.Completion result) {
        showDialog(result.title, result.output, "OK", null, "Details", new Runnable() {
            public void run() { message("Operation details", result.details); }
        });
    }
    private void confirm(String title, String body, String positive, Runnable confirmed) {
        showDialog(title, body, positive, confirmed, null, null);
    }
    private void message(String title, String body) { showDialog(title, body, "OK", null, null, null); }
    private void showDialog(String title, String body, String positive, Runnable confirmed, String secondary, Runnable secondaryAction) {
        if (!resumed || destroyed || isFinishing()) return;
        for (int i = dialogs.size() - 1; i >= 0; i--) if (!dialogs.get(i).isShowing()) dialogs.remove(i);
        dialogs.add(ManagerDialogs.show(this, title, body, positive, confirmed, secondary, secondaryAction));
    }
}
