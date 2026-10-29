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
import android.graphics.drawable.GradientDrawable;
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
    private final ArrayList<PackageScanner.Item> allItems = new ArrayList<PackageScanner.Item>();
    private final Button[] tabs = new Button[4];
    private final String[] categoryNames = { "Installed", "Updates", "Available", "Scripts" };
    private int category;
    private final ArrayList<Dialog> dialogs = new ArrayList<Dialog>();
    private TextView status;
    private String statusDetails;
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
    private boolean registryUnavailable;
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
                statusDetails = operations.progressDetails();
                status.setText(operations.progressText());
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
        button.setBackground(buttonBackground(PANEL)); button.setPadding(dp(10), dp(8), dp(10), dp(8));
        button.setMinWidth(0); button.setMinimumWidth(0); button.setMinHeight(dp(48));
        button.setTextSize(16);
        return button;
    }
    private android.graphics.drawable.Drawable buttonBackground(int color) {
        StateListDrawable states = new StateListDrawable();
        states.addState(new int[] { android.R.attr.state_pressed }, rounded(Color.rgb(57, 102, 135)));
        states.addState(new int[] { android.R.attr.state_focused }, rounded(Color.rgb(57, 102, 135)));
        states.addState(new int[0], rounded(color));
        return states;
    }
    private GradientDrawable rounded(int color) {
        GradientDrawable background = new GradientDrawable();
        background.setColor(color); background.setCornerRadius(dp(6));
        return background;
    }
    private LinearLayout.LayoutParams spaced(int width, int height, float weight, int gap) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(width, dp(height), weight);
        params.leftMargin = dp(gap);
        return params;
    }
    private TextView text(String value, int size, int color) {
        TextView text = new TextView(this);
        text.setText(value); text.setTextSize(size); text.setTextColor(color);
        return text;
    }
    private TextView column(String value, int size, int color) {
        TextView view = text(value, size, color);
        view.setMaxLines(2); view.setEllipsize(TextUtils.TruncateAt.END);
        view.setGravity(Gravity.CENTER_VERTICAL);
        view.setPadding(dp(8), 0, 0, 0);
        return view;
    }
    private void buildUi() {
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL); root.setPadding(dp(18), dp(12), dp(18), dp(14)); root.setBackgroundColor(BG);
        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = text("Package Manager", 24, TEXT);
        title.setMaxLines(1); title.setEllipsize(TextUtils.TruncateAt.END);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        header.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        refreshButton = button("Refresh");
        Button help = button("Help");
        Button close = button("Close");
        header.addView(refreshButton, spaced(dp(100), 48, 0, 12));
        header.addView(help, spaced(dp(76), 48, 0, 12));
        header.addView(close, spaced(dp(88), 48, 0, 20));
        root.addView(header);
        LinearLayout categories = new LinearLayout(this);
        categories.setPadding(0, dp(10), 0, dp(4));
        for (int i = 0; i < tabs.length; i++) {
            final int index = i;
            tabs[i] = button(categoryNames[i]); tabs[i].setTextSize(14);
            categories.addView(tabs[i], spaced(0, 48, 1, i == 0 ? 0 : 6));
            tabs[i].setOnClickListener(new View.OnClickListener() {
                public void onClick(View view) {
                    if (category == index) return;
                    category = index; filterItems(null);
                }
            });
        }
        root.addView(categories);
        LinearLayout feedback = new LinearLayout(this);
        feedback.setGravity(Gravity.CENTER_VERTICAL);
        progress = new ProgressBar(this);
        progress.setIndeterminate(true);
        progress.setContentDescription("Package operation in progress");
        progress.setVisibility(View.GONE);
        LinearLayout.LayoutParams spinnerSize = new LinearLayout.LayoutParams(dp(32), dp(32));
        spinnerSize.rightMargin = dp(12);
        feedback.addView(progress, spinnerSize);
        status = text("Loading packages…", 14, MUTED);
        status.setMaxLines(2); status.setEllipsize(TextUtils.TruncateAt.END);
        status.setFocusable(true);
        status.setOnClickListener(new View.OnClickListener() {
            public void onClick(View view) {
                final String detail = statusDetails;
                showDialog("Package status", status.getText().toString(), "OK", null,
                    detail == null ? null : "Details", new Runnable() {
                        public void run() { message("Scan details", detail); }
                    });
            }
        });
        status.setPadding(0, dp(6), 0, dp(8));
        feedback.addView(status, new LinearLayout.LayoutParams(0, -2, 1));
        root.addView(feedback, new LinearLayout.LayoutParams(-1, dp(40)));
        LinearLayout columns = new LinearLayout(this);
        columns.setPadding(dp(16), 0, dp(16), 0);
        columns.setGravity(Gravity.CENTER_VERTICAL);
        TextView nameHeading = column("Name", 14, MUTED); nameHeading.setPadding(0, 0, 0, 0);
        columns.addView(nameHeading, new LinearLayout.LayoutParams(0, -1, 3));
        columns.addView(column("Version", 14, MUTED), new LinearLayout.LayoutParams(0, -1, 1.5f));
        root.addView(columns, new LinearLayout.LayoutParams(-1, dp(36)));
        empty = text("", 18, MUTED); empty.setGravity(Gravity.CENTER);
        root.addView(empty, new LinearLayout.LayoutParams(-1, 0, 1));
        list = new ListView(this); list.setDivider(new ColorDrawable(BG)); list.setDividerHeight(dp(6));
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
        action.setBackground(buttonBackground(Color.rgb(25, 99, 137)));
        bar.addView(action, spaced(0, 56, 1.4f, 0));
        bar.addView(launch, spaced(0, 56, 1, 8));
        bar.addView(uninstall, spaced(0, 56, 1, 8));
        bar.addView(details, spaced(0, 56, 1, 8));
        root.addView(bar); setContentView(root);
        action.setOnClickListener(new View.OnClickListener() { public void onClick(View view) { chooseAction(); } });
        details.setOnClickListener(new View.OnClickListener() { public void onClick(View view) { showDetails(); } });
        uninstall.setOnClickListener(new View.OnClickListener() { public void onClick(View view) { confirmUninstall(); } });
        launch.setOnClickListener(new View.OnClickListener() { public void onClick(View view) { confirmLaunch(); } });
        refreshButton.setOnClickListener(new View.OnClickListener() { public void onClick(View view) { refresh(); } });
        help.setOnClickListener(new View.OnClickListener() { public void onClick(View view) { showHelp(); } });
        close.setOnClickListener(new View.OnClickListener() { public void onClick(View view) { finish(); } });
        updateButtons();
    }
    private void filterItems(String previousKey) {
        items.clear(); selected = -1;
        for (PackageScanner.Item item : allItems) {
            if (!PackagePresentation.inCategory(item, category)) continue;
            if (PackagePresentation.key(item).equals(previousKey)) selected = items.size();
            items.add(item);
        }
        for (int i = 0; i < tabs.length; i++) {
            int count = 0;
            for (PackageScanner.Item item : allItems) if (PackagePresentation.inCategory(item, i)) count++;
            tabs[i].setText(categoryNames[i] + " (" + count + ")");
            tabs[i].setSelected(i == category);
            tabs[i].setBackground(buttonBackground(i == category ? Color.rgb(25, 99, 137) : PANEL));
        }
        adapter.notifyDataSetChanged();
        if (selected >= 0) list.setSelection(selected); else list.setSelection(0);
        if (busy) {
            empty.setText("Scanning for packages…");
        } else if (registryUnavailable) {
            empty.setText("Could not load installed packages.\nTap Refresh to retry, or tap the status for Details.");
        } else if (!allItems.isEmpty()) {
            String[] emptyMessages = { "Nothing installed yet.\nChoose Available to install a package.",
                "No confirmed updates.\nCopy a newer release to USB, then tap Refresh.",
                "No new packages on USB.\nAdd a release with the USB companion, then tap Refresh.",
                "No scripts on USB." };
            empty.setText(emptyMessages[category]);
        }
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
        action.setEnabled(ready && PackagePresentation.canInstall(item));
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
        statusDetails = null;
        status.setText("Scanning USB and installed packages…");
        empty.setText("Scanning for packages…");
        new Thread(new Runnable() {
            public void run() {
                try {
                    final File usb = PackageScanner.findUsbRoot();
                    final ArrayList<PackageScanner.Item> next = PackageScanner.scan(usb);
                    NemesisCli.Result query = NemesisCli.run("pkg-list");
                    final InstalledPackages registry = InstalledPackages.parse(query.rc, query.out);
                    if (registry.available() && !registry.names.isEmpty()) {
                        NemesisCli.Result versions = NemesisCli.query("root", "-c", registry.versionQuery());
                        registry.readVersions(versions.rc, versions.out);
                    }
                    Set<String> seen = new HashSet<String>();
                    for (PackageScanner.Item item : next) {
                        item.installedStateKnown = registry.available();
                        item.installed = item.id != null && registry.names.containsKey(item.id);
                        item.locked = item.id != null && registry.locked.contains(item.id);
                        item.installedVersion = registry.versions.get(item.id);
                        if (item.installed) item.types = registry.types.get(item.id);
                        if (item.id != null) seen.add(item.id);
                    }
                    for (String id : registry.names.keySet()) {
                        if (seen.contains(id)) continue;
                        PackageScanner.Item item = new PackageScanner.Item();
                        item.kind = "installed"; item.id = id; item.installed = true;
                        item.locked = registry.locked.contains(id); item.types = registry.types.get(id);
                        item.title = registry.names.get(id);
                        item.installedVersion = registry.versions.get(id);
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
                            allItems.clear(); allItems.addAll(next);
                            registryUnavailable = !registry.available();
                            statusDetails = registry.available() ? null : registry.error;
                            status.setText(!registry.available() ? "Could not read installed packages. Tap Refresh to retry." :
                                (usb == null ? "No USB installers detected | " + next.size() + " installed packages" :
                                next.size() + " packages · Select a package"));
                            empty.setText(!registry.available() ? "Could not load installed packages.\nTap Refresh to retry, or tap the status for Details." :
                                (usb == null ? "No packages found.\nInsert a USB drive with a packages/ folder, then tap Refresh." :
                                "No packages found.\nAdd a release under packages/ on your USB, then tap Refresh."));
                            busy = false; filterItems(previousKey);
                        }
                    });
                } catch (final Exception error) {
                    runOnUiThread(new Runnable() {
                        public void run() {
                            if (destroyed) return;
                            registryUnavailable = false;
                            allItems.clear(); filterItems(null);
                            statusDetails = error.toString();
                            status.setText("Could not read packages. Check USB and tap Refresh.");
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
                row = new LinearLayout(MainActivity.this); row.setOrientation(LinearLayout.HORIZONTAL);
                row.setGravity(Gravity.CENTER_VERTICAL);
                row.setPadding(dp(16), dp(10), dp(16), dp(10)); row.setMinimumHeight(dp(72));
                LinearLayout nameColumn = new LinearLayout(MainActivity.this);
                nameColumn.setOrientation(LinearLayout.VERTICAL);
                TextView title = text("", 20, TEXT); title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
                title.setMaxLines(2); title.setEllipsize(TextUtils.TruncateAt.END);
                nameColumn.addView(title, new LinearLayout.LayoutParams(-1, -2));
                TextView subtitle = text("", 15, MUTED);
                subtitle.setSingleLine(true); subtitle.setEllipsize(TextUtils.TruncateAt.END);
                nameColumn.addView(subtitle, new LinearLayout.LayoutParams(-1, -2));
                row.addView(nameColumn, new LinearLayout.LayoutParams(0, -2, 3));
                row.addView(column("", 16, TEXT), new LinearLayout.LayoutParams(0, -2, 1.5f));
            }
            PackageScanner.Item item = items.get(position);
            LinearLayout nameColumn = (LinearLayout) row.getChildAt(0);
            ((TextView) nameColumn.getChildAt(0)).setText(PackagePresentation.name(item));
            TextView subtitle = (TextView) nameColumn.getChildAt(1);
            String state = PackageScanner.BROKEN.equals(item.kind) ? "Invalid installer" : PackagePresentation.state(item);
            subtitle.setText(state);
            // The active tab already supplies routine state; retain exceptions in the row.
            subtitle.setVisibility("Installed".equals(state) || "Not installed".equals(state) || "Script".equals(state) ? View.GONE : View.VISIBLE);
            ((TextView) row.getChildAt(1)).setText(PackagePresentation.versionColumn(item, category));
            StateListDrawable background = new StateListDrawable();
            background.addState(new int[] { android.R.attr.state_pressed }, new ColorDrawable(Color.rgb(62, 82, 108)));
            background.addState(new int[] { android.R.attr.state_focused }, new ColorDrawable(Color.rgb(62, 82, 108)));
            background.addState(new int[0], new ColorDrawable(position == selected ? Color.rgb(45, 65, 90) : PANEL));
            row.setBackground(background);
            row.setActivated(position == selected);
            return row;
        }
    }
    private void chooseAction() {
        final PackageScanner.Item item = selection();
        if (unavailable() || !PackagePresentation.canInstall(item)) return;
        String action = PackagePresentation.action(item);
        confirm(action + " " + PackagePresentation.name(item) + "?",
            PackagePresentation.confirmation(item), action, new Runnable() {
                public void run() { startOperation(item, null); }
            });
    }
    private void confirmUninstall() {
        final PackageScanner.Item item = selection();
        if (unavailable() || !PackagePresentation.canUninstall(item)) return;
        confirm("Uninstall " + PackagePresentation.name(item) + "?",
            "Remove it from the head unit. The installer and data on USB will be kept.", "Uninstall", new Runnable() {
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
            message("Open NEMESIS Manager", "Use Packages in NEMESIS Manager to install or remove Package Manager.");
            return;
        }
        if (command == null && !PackagePresentation.canInstall(item)) return;
        String description = (command == null ? (PackageScanner.EXECUTE.equals(item.kind) ? "Running script" : item.installed ? "Updating" : "Installing") :
            ("uninstall".equals(command) ? "Uninstalling" : "Launching")) + " | " + PackagePresentation.name(item);
        if (unavailable() || !operations.start(description, new PackageTask(getApplicationContext(), item, command))) {
            message("Please wait", "Let the current action finish, then try again.");
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
    private void showHelp() {
        message("Help", "Getting started\n" +
            "1. Insert your USB drive and tap Refresh.\n" +
            "2. Choose a tab, then select a package.\n" +
            "3. Tap Install, Update, Run script, or Launch.\n\n" +
            "Tabs\n" +
            "Installed: packages on the head unit.\n" +
            "Updates: newer versions found on USB.\n" +
            "Available: USB packages ready to install.\n" +
            "Scripts: tasks to run on the head unit; check their instructions first.\n\n" +
            "Adding or updating packages\n" +
            "Use the USB companion on your computer to copy releases to USB. Back here, tap Refresh, select the package, and confirm Install or Update.\n\n" +
            "Need more information?\n" +
            "Details shows versions, file locations, and errors. Install version means the versions could not be compared; check the release before continuing.\n" +
            "Uninstall removes the package from the head unit and keeps its USB files. To remove Package Manager itself, use NEMESIS Manager > Packages.\n\n" +
            "Use trusted releases that support your vehicle. Keep USB connected until the action finishes, and finish one action before using NEMESIS Manager.");
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
