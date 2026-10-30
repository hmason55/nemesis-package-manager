package dev.nemesis.usbmanager;

import android.content.Context;
import android.content.SharedPreferences;
import java.util.Map;

/** Last successful manager installations, never inferred from the current USB. */
final class InstalledVersionStore {
    private static SharedPreferences preferences(Context context) {
        return context.getSharedPreferences("installed-package-versions", Context.MODE_PRIVATE);
    }
    static void record(Context context, String id, String version, boolean removed) {
        if (!PackageScanner.validId(id)) return;
        SharedPreferences.Editor edit = preferences(context).edit();
        if (removed || version == null || version.trim().length() == 0) edit.remove(id);
        else edit.putString(id, version.trim());
        edit.commit();
    }
    static void apply(Context context, InstalledPackages registry) {
        if (!registry.available()) return;
        SharedPreferences prefs = preferences(context);
        SharedPreferences.Editor edit = prefs.edit();
        for (Map.Entry<String, ?> entry : prefs.getAll().entrySet()) {
            String id = entry.getKey();
            if (!registry.names.containsKey(id)) edit.remove(id);
            else if (!registry.versions.containsKey(id) && entry.getValue() instanceof String) {
                registry.versions.put(id, (String) entry.getValue());
                registry.savedVersions.add(id);
            }
        }
        for (Map.Entry<String, String> entry : registry.versions.entrySet()) {
            if (!registry.savedVersions.contains(entry.getKey()) && registry.names.containsKey(entry.getKey()))
                edit.putString(entry.getKey(), entry.getValue());
        }
        edit.commit();
    }
}
