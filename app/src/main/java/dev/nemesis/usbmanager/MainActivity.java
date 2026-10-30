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
import android.widget.FrameLayout;
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
    private String scanError;
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
    private View operationOverlay;
    private TextView operationStatus;
    private TextView operationInstruction;
    private boolean destroyed;
    private boolean cloudSelected;
    private boolean sourcePrompted;
    private String cloudQuery = "";
    private java.util.concurrent.atomic.AtomicBoolean downloadCancelled = new java.util.concurrent.atomic.AtomicBoolean();
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
        cloudSelected = "cloud".equals(getPreferences(MODE_PRIVATE).getString("source", "usb"));
        buildUi();
    }
    @Override protected void onResume() {
        super.onResume();
        resumed = true;
        handler.removeCallbacks(monitorOperation);
        monitorOperation.run();
        if (!sourcePrompted && getPreferences(MODE_PRIVATE).getBoolean("show_source_prompt", !getPreferences(MODE_PRIVATE).contains("source"))) { sourcePrompted = true; chooseSource(); }
    }
    @Override protected void onPause() {
        resumed = false;
        handler.removeCallbacks(monitorOperation);
        super.onPause();
    }
    @Override protected void onDestroy() {
        destroyed = true;
        downloadCancelled.set(true);
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
        background.setStroke(dp(1), Color.rgb(91, 116, 143));
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
        root.setOrientation(LinearLayout.VERTICAL); root.setPadding(dp(18), dp(8), dp(18), dp(8)); root.setBackgroundColor(BG);
        LinearLayout header = new LinearLayout(this);
        header.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = text("Package Manager", 24, TEXT);
        title.setMaxLines(1); title.setEllipsize(TextUtils.TruncateAt.END);
        title.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        header.addView(title, new LinearLayout.LayoutParams(0, -2, 1));
        Button changeSource = button("Settings"); changeSource.setTextSize(13);
        header.addView(changeSource, spaced(dp(128), 48, 0, 6));
        changeSource.setOnClickListener(new View.OnClickListener() { public void onClick(View view) { if (!unavailable()) chooseSource(); } });
        refreshButton = button("Refresh");
        Button help = button("Help");
        Button close = button("Close");
        header.addView(refreshButton, spaced(dp(100), 48, 0, 12));
        header.addView(help, spaced(dp(76), 48, 0, 12));
        header.addView(close, spaced(dp(88), 48, 0, 20));
        root.addView(header);
        LinearLayout categories = new LinearLayout(this);
        categories.setPadding(0, dp(6), 0, dp(2));
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
        LinearLayout columns = new LinearLayout(this);
        columns.setPadding(dp(16), 0, dp(16), 0);
        columns.setGravity(Gravity.CENTER_VERTICAL);
        TextView nameHeading = column("Name", 14, MUTED); nameHeading.setPadding(0, 0, 0, 0);
        columns.addView(nameHeading, new LinearLayout.LayoutParams(0, -1, 3));
        columns.addView(column("Version", 14, MUTED), new LinearLayout.LayoutParams(0, -1, 1.5f));
        root.addView(columns, new LinearLayout.LayoutParams(-1, dp(28)));
        empty = text("", 18, MUTED); empty.setGravity(Gravity.CENTER);
        empty.setOnClickListener(new View.OnClickListener() {
            public void onClick(View view) {
                if (scanError != null) message("Scan details", scanError);
            }
        });
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
        bar.setPadding(0, dp(6), 0, 0);
        action = button("Install"); launch = button("Launch"); uninstall = button("Uninstall"); details = button("Details");
        action.setBackground(buttonBackground(Color.rgb(25, 99, 137)));
        uninstall.setBackground(buttonBackground(Color.rgb(156, 111, 26)));
        bar.addView(uninstall, spaced(0, 48, 1.4f, 0));
        bar.addView(action, spaced(0, 48, 1.4f, 0));
        bar.addView(launch, spaced(0, 48, 1, 8));
        bar.addView(details, spaced(0, 48, 1, 8));
        root.addView(bar);
        FrameLayout screen = new FrameLayout(this);
        screen.addView(root, new FrameLayout.LayoutParams(-1, -1));
        buildOperationOverlay(screen);
        setContentView(screen);
        action.setOnClickListener(new View.OnClickListener() { public void onClick(View view) { chooseAction(); } });
        details.setOnClickListener(new View.OnClickListener() { public void onClick(View view) { showDetails(); } });
        uninstall.setOnClickListener(new View.OnClickListener() { public void onClick(View view) { confirmUninstall(); } });
        launch.setOnClickListener(new View.OnClickListener() { public void onClick(View view) { confirmLaunch(); } });
        refreshButton.setOnClickListener(new View.OnClickListener() { public void onClick(View view) { refresh(); } });
        help.setOnClickListener(new View.OnClickListener() { public void onClick(View view) { showHelp(); } });
        close.setOnClickListener(new View.OnClickListener() { public void onClick(View view) { finish(); } });
        updateButtons();
    }
    private void buildOperationOverlay(FrameLayout screen) {
        FrameLayout overlay = new FrameLayout(this);
        overlay.setBackgroundColor(Color.argb(210, 0, 0, 0));
        overlay.setClickable(true); overlay.setFocusable(true);
        LinearLayout panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL); panel.setGravity(Gravity.CENTER);
        panel.setPadding(dp(24), dp(20), dp(24), dp(20)); panel.setBackground(rounded(PANEL));
        progress = new ProgressBar(this); progress.setIndeterminate(true);
        progress.setContentDescription("Package operation in progress");
        panel.addView(progress, new LinearLayout.LayoutParams(dp(48), dp(48)));
        operationStatus = text("", 20, TEXT); operationStatus.setGravity(Gravity.CENTER);
        operationStatus.setMaxLines(2); operationStatus.setEllipsize(TextUtils.TruncateAt.END);
        operationStatus.setPadding(0, dp(12), 0, 0);
        operationStatus.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);
        panel.addView(operationStatus, new LinearLayout.LayoutParams(-1, -2));
        TextView instruction = text("Keep USB plugged in until installation finishes.", 16, MUTED);
        operationInstruction = instruction;
        instruction.setGravity(Gravity.CENTER); instruction.setPadding(0, dp(8), 0, 0);
        panel.addView(instruction, new LinearLayout.LayoutParams(-1, -2));
        Button operationDetails = button("Details");
        operationDetails.setOnClickListener(new View.OnClickListener() {
            public void onClick(View view) { message("Operation details", operations.progressDetails()); }
        });
        operationDetails.setBackground(buttonBackground(Color.rgb(25, 99, 137)));
        LinearLayout.LayoutParams detailsSize = new LinearLayout.LayoutParams(dp(180), dp(48));
        detailsSize.topMargin = dp(16);
        panel.addView(operationDetails, detailsSize);
        FrameLayout.LayoutParams size = new FrameLayout.LayoutParams(Math.min(getResources().getDisplayMetrics().widthPixels - dp(48), dp(620)), -2, Gravity.CENTER);
        size.leftMargin = dp(24); size.rightMargin = dp(24);
        overlay.addView(panel, size);
        operationOverlay = overlay; overlay.setVisibility(View.GONE);
        screen.addView(overlay, new FrameLayout.LayoutParams(-1, -1));
    }
    private void filterItems(String previousKey) {
        items.clear(); selected = -1;
        Set<String> installedIds = new HashSet<String>();
        for (PackageScanner.Item item : allItems) {
            if (!PackagePresentation.inCategory(item, category)) continue;
            if (category == PackagePresentation.INSTALLED && item.id != null && !installedIds.add(item.id)) continue;
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
            empty.setText("Scanning for packages\u2026");
        } else if (scanError != null) {
            empty.setText("Could not load installed packages.\nTap Refresh to retry, or tap here for Details.");
        } else if (!allItems.isEmpty()) {
            String[] emptyMessages = { "Nothing installed yet.\nChoose Available to install a package.",
                "No confirmed updates.\nCopy a newer release to USB, then tap Refresh.",
                "No new packages on USB.\nAdd a release with the USB companion, then tap Refresh.",
                "No scripts on USB." };
            empty.setText(emptyMessages[category]);
        }
        if (!busy && cloudSelected && items.isEmpty() && scanError == null) empty.setText(category == PackagePresentation.SCRIPTS ? "Scripts are available from USB Storage.\nUse Settings to switch to USB." : category == PackagePresentation.UPDATES ? "No confirmed newer registry versions." : category == PackagePresentation.INSTALLED ? "No installed packages." : "No approved packages match your search.");
        updateButtons();
    }
    private PackageScanner.Item selection() {
        return selected >= 0 && selected < items.size() ? items.get(selected) : null;
    }
    private boolean unavailable() { return busy || operations.isRunning(); }
    private void updateButtons() {
        boolean running = operations.isRunning();
        String statusText = running ? operations.progressText() : "";
        if (!statusText.contentEquals(operationStatus.getText())) operationStatus.setText(statusText);
        operationInstruction.setVisibility(running && operations.needsUsb() ? View.VISIBLE : View.GONE);
        operationOverlay.setVisibility(running ? View.VISIBLE : View.GONE);
        progress.setVisibility(running ? View.VISIBLE : View.GONE);
        for (Button tab : tabs) tab.setEnabled(!running);
        list.setEnabled(!running);
        PackageScanner.Item item = selection();
        boolean ready = !unavailable() && item != null;
        boolean installedTab = category == PackagePresentation.INSTALLED;
        action.setVisibility(installedTab ? View.GONE : View.VISIBLE);
        uninstall.setVisibility(installedTab ? View.VISIBLE : View.GONE);
        launch.setVisibility(installedTab ? View.VISIBLE : View.GONE);
        action.setText(category == PackagePresentation.UPDATES ? "Update" : category == PackagePresentation.SCRIPTS ? "Run script" : "Install");
        action.setEnabled(ready && !installedTab && PackagePresentation.canInstall(item));
        launch.setEnabled(ready && installedTab && PackagePresentation.canLaunch(item));
        uninstall.setEnabled(ready && installedTab && PackagePresentation.canUninstall(item));
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
        scanError = null;
        empty.setText("Scanning for packages...");
        new Thread(new Runnable() {
            public void run() {
                try {
                    final File usb = PackageScanner.findUsbRoot();
                    final ArrayList<PackageScanner.Item> next = new ArrayList<PackageScanner.Item>();
                    String loadError = null;
                    try {
                        PackageSource source = cloudSelected ? cloudSource() : new UsbPackageSource(usb);
                        for (PackageRecord record : source.list(cloudSelected ? cloudQuery : "")) next.add(record.local != null ? record.local : CloudPackageSource.item(record, null));
                    } catch (Exception error) { loadError = "Cloud registry unavailable: " + error.getMessage(); }
                    final String sourceError = loadError;
                    NemesisCli.Result query = NemesisCli.run("pkg-list");
                    final InstalledPackages registry = InstalledPackages.parse(query.rc, query.out);
                    if (registry.available() && !registry.names.isEmpty()) {
                        NemesisCli.Result versions = NemesisCli.query("root", "-c", registry.versionQuery());
                        registry.readVersions(versions.rc, versions.out);
                    }
                    InstalledVersionStore.apply(getApplicationContext(), registry);
                    Set<String> seen = new HashSet<String>();
                    for (PackageScanner.Item item : next) {
                        item.installedStateKnown = registry.available();
                        item.installed = item.id != null && registry.names.containsKey(item.id);
                        item.locked = item.id != null && registry.locked.contains(item.id);
                        item.installedVersion = registry.versions.get(item.id);
                        item.installedVersionSaved = registry.savedVersions.contains(item.id);
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
                        item.installedVersionSaved = registry.savedVersions.contains(id);
                        next.add(item);
                    }
                    for (java.util.Iterator<PackageScanner.Item> iterator = next.iterator(); iterator.hasNext(); )
                        if (PackagePresentation.isManager(iterator.next())) iterator.remove();
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
                            scanError = registry.error != null ? registry.error : sourceError;
                            empty.setText(usb == null ? "No packages found.\nInsert a USB drive with a packages/ folder, then tap Refresh." :
                                "No packages found.\nAdd a release under packages/ on your USB, then tap Refresh.");
                            busy = false; filterItems(previousKey);
                        }
                    });
                } catch (final Exception error) {
                    runOnUiThread(new Runnable() {
                        public void run() {
                            if (destroyed) return;
                            scanError = error.toString();
                            allItems.clear(); busy = false; filterItems(null);
                            empty.setText("Could not read packages.\nCheck USB and tap Refresh, or tap here for Details.");
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
        if (category == PackagePresentation.INSTALLED || unavailable() || !PackagePresentation.canInstall(item)) return;
        if (item.remote != null && item.target == null) { download(item); return; }
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
        if (PackagePresentation.isManager(item)) {
            message("Open NEMESIS Manager", "Use Packages in NEMESIS Manager to manage Package Manager itself.");
            return;
        }
        if (command == null && !PackagePresentation.canInstall(item)) return;
        String description = (command == null ? (PackageScanner.EXECUTE.equals(item.kind) ? "Running script" : item.installed ? "Updating" : "Installing") :
            ("uninstall".equals(command) ? "Uninstalling" : "Launching")) + "\n" + PackagePresentation.name(item);
        if (unavailable() || !operations.start(description, item.remote == null && ("install".equals(PackagePresentation.operation(item, command)) || "update".equals(PackagePresentation.operation(item, command))), new PackageTask(getApplicationContext(), item, command))) {
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
                if (command == null && item.remote != null) {
                    android.content.SharedPreferences preferences = context.getSharedPreferences("MainActivity", Context.MODE_PRIVATE);
                    new CloudPackageSource(preferences.getString("registry_url", ""), context.getCacheDir()).current(item.remote);
                    CloudArchive.validate(item.target, item.remote);
                }
                result = command != null ? NemesisCli.run(command, item.id) :
                    (PackageScanner.EXECUTE.equals(item.kind) ? NemesisCli.execute(item) : NemesisCli.install(context, item));
            } catch (Exception error) { result = new NemesisCli.Result(1, error.toString()); }
            if (result.operation != null) operation = result.operation;
            if (result.rc == 0 && ("install".equals(operation) || "update".equals(operation) || "uninstall".equals(operation)))
                InstalledVersionStore.record(context, item.id, item.version, "uninstall".equals(operation));
            OperationCoordinator.Completion completion = PackagePresentation.completion(item, operation, result.rc, result.out);
            String logError = writeActionLog(item, completion.details);
            if (logError != null) return new OperationCoordinator.Completion(completion.success, completion.title,
                completion.output + "\n\nHistory could not be saved. Open Details for the reason.", completion.details + "\n\n" + logError);
            return completion;
        }
    }
    private void showDetails() {
        PackageScanner.Item item = selection();
        if (item != null && !unavailable()) {
            if (item.remote == null) message(PackagePresentation.name(item), PackagePresentation.details(item));
            else {
                final String id = item.id;
                showDialog(PackagePresentation.name(item), PackagePresentation.details(item), "OK", null, "Choose version", new Runnable() { public void run() { chooseCloudVersion(id); } });
            }
        }
    }
    private void chooseCloudVersion(String id) {
        final ArrayList<PackageScanner.Item> versions = new ArrayList<PackageScanner.Item>();
        for (PackageScanner.Item item : allItems) if (item.remote != null && id.equals(item.id)) versions.add(item);
        String[] labels = new String[versions.size()];
        for (int i = 0; i < labels.length; i++) labels[i] = versions.get(i).version + " — " + PackagePresentation.action(versions.get(i));
        android.app.AlertDialog dialog = new android.app.AlertDialog.Builder(this).setTitle("Choose package version").setItems(labels, new android.content.DialogInterface.OnClickListener() { public void onClick(android.content.DialogInterface dialog, int which) {
            PackageScanner.Item item = versions.get(which);
            if (PackagePresentation.canInstall(item)) download(item);
            else message("Version not selected", "This version is already installed, older, locked, or its installed state is unavailable. Choose a newer version or check its details.");
        } }).setNegativeButton("Cancel", null).create();
        dialogs.add(dialog); dialog.show();
    }
    private CloudPackageSource cloudSource() throws Exception { return new CloudPackageSource(getPreferences(MODE_PRIVATE).getString("registry_url", ""), getCacheDir()); }
    private void chooseSource() {
        if (!resumed || destroyed || operations.isRunning()) return;
        android.widget.LinearLayout panel = new android.widget.LinearLayout(this); panel.setOrientation(LinearLayout.VERTICAL); panel.setPadding(dp(20), dp(8), dp(20), dp(8));
        final android.widget.RadioGroup sources = new android.widget.RadioGroup(this);
        android.widget.RadioButton cloud = new android.widget.RadioButton(this); cloud.setId(1001); cloud.setText("Cloud Registry — browse and download packages"); sources.addView(cloud);
        android.widget.RadioButton usb = new android.widget.RadioButton(this); usb.setId(1002); usb.setText("USB Storage — packages and scripts, available offline"); sources.addView(usb); sources.check(cloudSelected ? 1001 : 1002); panel.addView(sources);
        final android.widget.CheckBox remember = new android.widget.CheckBox(this); remember.setText("Don’t show again on startup"); remember.setChecked(!getPreferences(MODE_PRIVATE).getBoolean("show_source_prompt", !getPreferences(MODE_PRIVATE).contains("source"))); panel.addView(remember);
        final android.widget.EditText address = new android.widget.EditText(this); address.setHint("Registry HTTPS address"); address.setSingleLine(true); address.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI); address.setText(getPreferences(MODE_PRIVATE).getString("registry_url", "")); panel.addView(address);
        final android.widget.EditText search = new android.widget.EditText(this); search.setHint("Search cloud packages (optional)"); search.setSingleLine(true); search.setText(cloudQuery); panel.addView(search);
        final android.widget.EditText profile = new android.widget.EditText(this); profile.setHint("Vehicle / firmware notes (optional)"); profile.setText(getPreferences(MODE_PRIVATE).getString("profile", android.os.Build.MODEL + " / " + android.os.Build.DISPLAY)); panel.addView(profile);
        final android.widget.EditText vehicle = profileField(panel, "Vehicle model (optional)", "device_vehicle");
        final android.widget.EditText firmware = profileField(panel, "Firmware version (optional)", "device_firmware");
        final android.widget.EditText nemesis = profileField(panel, "NEMESIS version (optional)", "device_nemesis");
        TextView guidance = text("Compatibility uses your profile below. Leave unknown values blank. Declarations are advisory and never block installation.", 14, MUTED); panel.addView(guidance);
        android.widget.ScrollView scroll = new android.widget.ScrollView(this); scroll.addView(panel);
        final android.app.AlertDialog dialog = new android.app.AlertDialog.Builder(this).setTitle("Package Manager settings — choose source").setView(scroll).setPositiveButton("Continue", null).setNegativeButton("Cancel", null).create();
        dialogs.add(dialog); dialog.show();
        dialog.getButton(android.app.AlertDialog.BUTTON_POSITIVE).setOnClickListener(new View.OnClickListener() { public void onClick(View view) {
            if (unavailable()) { android.widget.Toast.makeText(MainActivity.this, "Wait for the current refresh to finish", android.widget.Toast.LENGTH_SHORT).show(); return; }
            boolean nextCloud = sources.getCheckedRadioButtonId() == 1001;
            if (nextCloud) try { new CloudPackageSource(address.getText().toString().trim(), getCacheDir()); } catch (Exception error) { address.setError("Enter the registry HTTPS address"); return; }
            cloudSelected = nextCloud; cloudQuery = search.getText().toString();
            android.content.SharedPreferences.Editor edit = getPreferences(MODE_PRIVATE).edit().putString("registry_url", address.getText().toString().trim()).putString("profile", profile.getText().toString());
            edit.putString("source", cloudSelected ? "cloud" : "usb").putBoolean("show_source_prompt", !remember.isChecked()).putString("device_vehicle", vehicle.getText().toString().trim()).putString("device_firmware", firmware.getText().toString().trim()).putString("device_nemesis", nemesis.getText().toString().trim()); edit.apply(); dialog.dismiss(); refresh();
        } });
    }
    private android.widget.EditText profileField(LinearLayout panel, String label, String key) {
        TextView caption = text(label, 16, TEXT); panel.addView(caption);
        android.widget.EditText input = new android.widget.EditText(this); input.setSingleLine(true); input.setContentDescription(label);
        input.setText(getPreferences(MODE_PRIVATE).getString(key, "")); panel.addView(input); return input;
    }
    private String compatibilityWarning(PackageRecord record) {
        return CompatibilityAdvisory.describe(record, getPreferences(MODE_PRIVATE).getString("device_vehicle", ""), getPreferences(MODE_PRIVATE).getString("device_firmware", ""), getPreferences(MODE_PRIVATE).getString("device_nemesis", ""));
    }
    private void download(final PackageScanner.Item selectedItem) {
        busy = true; updateButtons(); downloadCancelled.set(false);
        final android.app.ProgressDialog dialog = new android.app.ProgressDialog(this); dialog.setTitle("Download " + selectedItem.title); dialog.setMessage("Verifying approved release…"); dialog.setProgressStyle(android.app.ProgressDialog.STYLE_HORIZONTAL); dialog.setMax(100); dialog.setCancelable(false);
        dialog.setButton(android.content.DialogInterface.BUTTON_NEGATIVE, "Cancel download", new android.content.DialogInterface.OnClickListener() { public void onClick(android.content.DialogInterface d, int which) { downloadCancelled.set(true); } });
        dialogs.add(dialog); dialog.show();
        new Thread(new Runnable() { public void run() {
            try {
                final PackageScanner.Item acquired = cloudSource().acquire(selectedItem.remote, new PackageSource.Progress() {
                    public boolean cancelled() { return downloadCancelled.get() || destroyed; }
                    public void update(final long received, final long total) { runOnUiThread(new Runnable() { public void run() { if (!destroyed) { dialog.setProgress((int) (received * 100 / total)); dialog.setMessage(received / 1024 + " / " + total / 1024 + " KiB"); } } }); }
                });
                acquired.installed = selectedItem.installed; acquired.installedStateKnown = selectedItem.installedStateKnown; acquired.installedVersion = selectedItem.installedVersion; acquired.installedVersionSaved = selectedItem.installedVersionSaved; acquired.locked = selectedItem.locked; acquired.types = selectedItem.types;
                acquired.customDataDir = new File(new File(getFilesDir(), "package-history"), acquired.id);
                runOnUiThread(new Runnable() { public void run() {
                    busy = false; dialog.dismiss(); if (destroyed || downloadCancelled.get()) return; updateButtons();
                    String profile = getPreferences(MODE_PRIVATE).getString("profile", android.os.Build.MODEL + " / " + android.os.Build.DISPLAY);
                    confirm("Install " + acquired.title + " " + acquired.version + "?", "Download verified against registry approval.\n\nYour device: " + profile + "\n\n" + acquired.remote.compatibility + "\n\n" + compatibilityWarning(acquired.remote) + "\n\nCompatibility is advisory. A mismatch or missing information does not establish support. Check the publisher's requirements before continuing.\n\n" + acquired.remote.releaseNotes, "Install", new Runnable() { public void run() { startOperation(acquired, null); } });
                } });
            } catch (final Exception error) { runOnUiThread(new Runnable() { public void run() { busy = false; dialog.dismiss(); if (!destroyed) { updateButtons(); message("Download not completed", error.getMessage()); } } }); }
        } }, "nemesis-cloud-download").start();
    }
    private void showHelp() {
        message("Help", "Getting started\n" +
            "1. Insert your USB drive and tap Refresh.\n" +
            "2. Choose a tab, then select a package.\n" +
            "3. Use the actions shown for that tab.\n\n" +
            "Tabs\n" +
            "Installed: uninstall or launch packages on the head unit.\n" +
            "Updates: newer versions found on USB.\n" +
            "Available: USB packages ready to install.\n" +
            "Scripts: tasks to run on the head unit; check their instructions first.\n\n" +
            "Adding or updating packages\n" +
            "Use the USB companion on your computer to copy releases to USB. Back here, tap Refresh, select the package, and confirm Install or Update.\n\n" +
            "Need more information?\n" +
            "Details shows versions, file locations, and errors. Versions saved after successful manager installs are marked in Details. To update, copy a newer installer to USB and use Updates.\n" +
            "Uninstall removes the package from the head unit and keeps its USB files. To remove Package Manager itself, use NEMESIS Manager > Packages.\n\n" +
            "Use trusted releases that support your vehicle. Keep USB plugged in during installs and updates. Finish one action before using NEMESIS Manager.");
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
