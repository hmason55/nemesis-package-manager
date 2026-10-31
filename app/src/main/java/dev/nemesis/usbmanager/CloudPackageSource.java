package dev.nemesis.usbmanager;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.URL;
import java.net.URLEncoder;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import javax.net.ssl.HttpsURLConnection;
import org.json.JSONArray;
import org.json.JSONObject;

public final class CloudPackageSource implements PackageSource {
    private final String base;
    private final File cache;
    interface Connections { HttpsURLConnection open(String address) throws Exception; }
    private final Connections connections;
    public CloudPackageSource(String base, File cache) throws Exception {
        this(base, cache, new Connections() { public HttpsURLConnection open(String address) throws Exception { return (HttpsURLConnection) new URL(address).openConnection(); } });
    }
    CloudPackageSource(String base, File cache, Connections connections) throws Exception {
        URL url = new URL(base);
        if (!"https".equals(url.getProtocol()) || url.getUserInfo() != null || url.getQuery() != null || url.getRef() != null) throw new IOException("Configure an HTTPS registry URL");
        this.base = base.replaceAll("/+$", ""); this.cache = new File(cache, "cloud-installers"); this.connections = connections;
    }
    private String escape(String text) throws Exception { return URLEncoder.encode(text, "UTF-8").replace("+", "%20").replace("*", "%2A").replace("%7E", "~"); }
    private HttpsURLConnection connect(String address) throws Exception {
        if (!address.startsWith(base + "/")) throw new IOException("Unexpected registry host");
        HttpsURLConnection connection = connections.open(address);
        connection.setSSLSocketFactory(new Tls12SocketFactory((javax.net.ssl.SSLSocketFactory) javax.net.ssl.SSLSocketFactory.getDefault()));
        connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(15000); connection.setReadTimeout(30000);
        connection.setRequestProperty("Cache-Control", "no-cache");
        try { if (connection.getResponseCode() != 200) throw new IOException("Registry request failed: " + connection.getResponseCode()); return connection; }
        catch (Exception error) { connection.disconnect(); throw error; }
    }
    private JSONObject json(String path) throws Exception {
        HttpsURLConnection connection = connect(base + path);
        try { InputStream input = connection.getInputStream();
            try { ByteArrayOutputStream data = new ByteArrayOutputStream(); byte[] buffer = new byte[8192]; int n;
                while ((n = input.read(buffer)) != -1) { if (data.size() + n > 4 * 1024 * 1024) throw new IOException("Registry response too large"); data.write(buffer, 0, n); }
                return new JSONObject(data.toString("UTF-8"));
            } finally { input.close(); }
        } finally { connection.disconnect(); }
    }
    private PackageRecord record(JSONObject value) throws Exception {
        PackageRecord record = new PackageRecord(); record.id = value.getString("package_id"); record.version = value.getString("version");
        record.name = value.optString("name", record.id); record.description = value.optString("description"); record.releaseNotes = value.optString("release_notes");
        JSONObject compatibility = value.optJSONObject("compatibility"); record.compatibility = compatibility == null ? "Compatibility not specified" : "Vehicles: " + compatibility.optJSONArray("vehicles") + "\nFirmware: " + compatibility.optJSONArray("firmware") + "\nNEMESIS: " + compatibility.optString("nemesis");
        if (compatibility != null) {
            record.vehicles = declarations(compatibility.optJSONArray("vehicles"));
            record.firmware = declarations(compatibility.optJSONArray("firmware"));
            record.nemesisSupport = compatibility.optString("nemesis", "");
        }
        record.sha256 = value.getString("sha256"); record.size = value.getLong("size"); record.downloadUrl = value.getString("download_url");
        String expected = base + "/v1/packages/" + escape(record.id) + "/versions/" + escape(record.version) + "/download";
        if (!PackageScanner.validId(record.id) || !record.sha256.matches("[a-f0-9]{64}") || record.size <= 0 || record.size > CloudArchive.MAX_BYTES || !expected.equals(record.downloadUrl)) throw new IOException("Invalid registry package metadata");
        return record;
    }
    private String[] declarations(JSONArray values) throws Exception {
        if (values == null) return new String[0];
        String[] result = new String[values.length()];
        for (int i = 0; i < result.length; i++) result[i] = values.getString(i);
        return result;
    }
    public List<PackageRecord> list(String query) throws Exception {
        ArrayList<PackageRecord> result = new ArrayList<PackageRecord>(); int page = 1;
        do {
            JSONObject catalog = json("/v1/packages?q=" + escape(query == null ? "" : query) + "&page=" + page);
            JSONArray packages = catalog.getJSONArray("packages");
            for (int i = 0; i < packages.length(); i++) {
                JSONObject pkg = packages.getJSONObject(i);
                JSONObject details = json("/v1/packages/" + escape(pkg.getString("id")));
                JSONArray versions = details.getJSONArray("versions");
                for (int j = 0; j < versions.length(); j++) {
                    PackageRecord item = record(versions.getJSONObject(j)); item.publisher = pkg.optString("publisher"); item.repository = details.optString("repository"); result.add(item);
                }
            }
            if (catalog.isNull("next_page")) break;
            int next = catalog.getInt("next_page"); if (next != page + 1 || next > 100) throw new IOException("Registry pagination limit exceeded"); page = next;
        } while (true);
        return result;
    }
    public PackageRecord current(PackageRecord record) throws Exception {
        PackageRecord fresh = record(json("/v1/packages/" + escape(record.id) + "/versions/" + escape(record.version)));
        if (!fresh.id.equals(record.id) || !fresh.version.equals(record.version) || !fresh.sha256.equals(record.sha256) || fresh.size != record.size) throw new IOException("Registry approval changed; refresh packages");
        return fresh;
    }
    public List<PackageRecord> versions(String id) throws Exception {
        JSONObject details = json("/v1/packages/" + escape(id));
        JSONArray values = details.getJSONArray("versions");
        ArrayList<PackageRecord> records = new ArrayList<PackageRecord>();
        for (int i = 0; i < values.length(); i++) {
            PackageRecord value = record(values.getJSONObject(i));
            if (!id.equals(value.id)) throw new IOException("Registry package identity mismatch");
            value.publisher = details.optString("publisher"); value.repository = details.optString("repository"); records.add(value);
        }
        return records;
    }
    public PackageScanner.Item acquire(PackageRecord source, Progress progress) throws Exception {
        PackageRecord record = current(source);
        record.publisher = source.publisher; record.repository = source.repository;
        if (!cache.isDirectory() && !cache.mkdirs()) throw new IOException("Cannot create installer cache");
        File target = new File(cache, record.sha256 + ".zip");
        if (target.isFile()) { try { CloudArchive.validate(target, record); current(record); return item(record, target); } catch (Exception error) { target.delete(); } }
        prune(record.size);
        if (cache.getUsableSpace() < record.size + 16L * 1024 * 1024) throw new IOException("Not enough cache space");
        File partial = File.createTempFile("download-", ".partial", cache);
        try {
            HttpsURLConnection connection = connect(record.downloadUrl);
            try { InputStream input = connection.getInputStream();
                try { FileOutputStream output = new FileOutputStream(partial);
                    try { byte[] buffer = new byte[65536]; long total = 0; int n;
                        while ((n = input.read(buffer)) != -1) { if (progress.cancelled()) throw new IOException("Download cancelled"); total += n; if (total > record.size) throw new IOException("Download exceeds approved size"); output.write(buffer, 0, n); progress.update(total, record.size); }
                    } finally { output.close(); }
                } finally { input.close(); }
            } finally { connection.disconnect(); }
            if (progress.cancelled()) throw new IOException("Download cancelled");
            CloudArchive.validate(partial, record); current(record);
            if (!partial.renameTo(target)) throw new IOException("Cannot publish verified cache file");
            return item(record, target);
        } finally { partial.delete(); }
    }
    private void prune(long incoming) throws IOException {
        File[] files = cache.listFiles(); if (files == null) return;
        Arrays.sort(files, new Comparator<File>() { public int compare(File a, File b) { return a.lastModified() < b.lastModified() ? -1 : a.lastModified() == b.lastModified() ? 0 : 1; } });
        long size = 0; for (File file : files) size += file.length();
        for (File file : files) if (size + incoming > CloudArchive.MAX_BYTES || file.getName().endsWith(".partial")) { long length = file.length(); if (file.delete()) size -= length; }
        if (size + incoming > CloudArchive.MAX_BYTES) throw new IOException("Installer cache is full");
    }
    public static PackageScanner.Item item(PackageRecord record, File file) {
        PackageScanner.Item item = new PackageScanner.Item(); item.id = record.id; item.title = record.name; item.version = record.version; item.kind = PackageScanner.INSTALL;
        item.target = file; item.folder = file == null ? null : file.getParentFile(); item.remote = record;
        item.detail = record.description + "\n" + record.compatibility + "\n" + record.releaseNotes; return item;
    }
}
