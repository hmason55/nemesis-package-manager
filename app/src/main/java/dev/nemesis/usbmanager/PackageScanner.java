package dev.nemesis.usbmanager;

import java.io.BufferedReader;
import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/** Pure-Java USB package discovery. No actions occur during discovery. */
public final class PackageScanner {
    public static final String INSTALL = "install";
    public static final String EXECUTE = "execute";
    public static final String RAW = "raw";
    public static final String BROKEN = "invalid";
    public static class Item {
        public File folder;
        public File target;
        public File customDataDir;
        public String kind;
        public String title;
        public String id;
        public String error;
        public String detail;
        public boolean installed;
        public boolean locked;
        public File dataDir() { return customDataDir != null ? customDataDir : (folder == null ? null : new File(folder, "data")); }
        public String label() { return title + "  [" + kind + "]" + (installed ? "  INSTALLED" : ""); }
    }
    private PackageScanner() { }

    public static File findUsbRoot() {
        String[] paths = {"/storage/usb0", "/storage/usb1", "/storage/usb2",
            "/mnt/media_rw/usb0", "/mnt/media_rw/usb1", "/mnt/media_rw/usb2"};
        for (String p : paths) {
            File dir = new File(p);
            if (new File(dir, "packages").isDirectory() && dir.canRead()) return dir;
        }
        return null;
    }

    public static ArrayList<Item> scan(File usbRoot) {
        ArrayList<Item> out = new ArrayList<Item>();
        if (usbRoot == null) return out;
        File root = new File(usbRoot, "packages");
        File[] entries = root.listFiles();
        if (entries == null) return out;
        Arrays.sort(entries, new Comparator<File>() {
            public int compare(File a, File b) { return a.getName().compareToIgnoreCase(b.getName()); }
        });
        for (File entry : entries) {
            if (entry.getName().startsWith(".")) continue;
            if (entry.isDirectory()) {
                // data is a permanent output folder; never scan it as an installer.
                File manifest = new File(entry, "NEMESIS.data");
                if (manifest.isFile()) out.add(fromDirectory(entry, manifest));
                else {
                    File[] children = entry.listFiles();
                    if (children != null) {
                        for (File child : children) {
                            if (child.isFile() && child.getName().toLowerCase().endsWith(".zip"))
                                out.add(fromZip(entry, child));
                        }
                    }
                }
            } else if (entry.isFile() && entry.getName().toLowerCase().endsWith(".zip")) {
                out.add(fromZip(root, entry));
            }
        }
        return out;
    }

    private static Item base(File folder, String title) {
        Item i = new Item(); i.folder = folder; i.title = title; i.kind = BROKEN;
        i.error = "Unrecognized package"; i.detail = ""; return i;
    }

    private static Item fromDirectory(File folder, File manifest) {
        Item i = base(folder, folder.getName());
        try {
            Map<String,String> data = parse(manifest);
            String type = value(data, "type");
            i.id = value(data, "id");
            String friendly = value(data, "name");
            if (friendly.length() > 0) i.title = friendly;
            if (INSTALL.equals(type) || EXECUTE.equals(type)) {
                String path = value(data, "path");
                i.target = resolveInside(folder, path);
                if (!i.target.isFile()) throw new IOException("Referenced file missing: " + path);
                if (INSTALL.equals(type) && !path.toLowerCase().endsWith(".zip"))
                    throw new IOException("Install target must be a ZIP");
                i.kind = type; i.error = null;
                i.detail = i.target.getAbsolutePath();
                if (INSTALL.equals(type)) {
                    String zipId = readZipId(i.target);
                    if (zipId == null) throw new IOException("Referenced ZIP lacks a valid package NEMESIS.data");
                    i.id = zipId;
                }
            } else if (type.length() == 0 && validId(i.id)) {
                i.kind = RAW; i.target = folder; i.error = null;
                i.detail = "Source folder; temporarily zipped before installation";
            } else {
                throw new IOException("Unsupported descriptor: type=" + type);
            }
        } catch (Exception e) { i.kind = BROKEN; i.error = e.getMessage(); }
        return i;
    }

    private static Item fromZip(File folder, File zip) {
        Item i = base(folder, zip.getName());
        if (folder.getName().equals("packages")) {
            String base = zip.getName();
            if (base.toLowerCase().endsWith(".zip")) base = base.substring(0, base.length()-4);
            i.customDataDir = new File(new File(folder, base), "data");
        }
        try {
            String id = readZipId(zip);
            if (id == null) throw new IOException("ZIP missing installable package metadata; extract USB bundle with import_release.py");
            i.kind = INSTALL; i.target = zip; i.id = id; i.error = null;
            i.detail = zip.getAbsolutePath();
        } catch (Exception e) { i.error = e.getMessage(); }
        return i;
    }

    static String readZipId(File zipFile) throws IOException {
        ZipFile zip = new ZipFile(zipFile);
        try {
            ZipEntry meta = zip.getEntry("NEMESIS.data");
            // NEMESIS also accepts exactly one enclosing directory in a ZIP.
            if (meta == null) {
                String prefix = null;
                java.util.Enumeration<? extends ZipEntry> iter = zip.entries();
                while (iter.hasMoreElements()) {
                    ZipEntry e = iter.nextElement();
                    if (!e.getName().endsWith("/NEMESIS.data")) continue;
                    String parent = e.getName().substring(0,e.getName().length()-"NEMESIS.data".length());
                    if (parent.indexOf('/', 0) != parent.length() - 1 || parent.startsWith("/")) continue;
                    if (prefix != null) return null;
                    prefix = parent;
                    meta = e;
                }
            }
            if (meta == null) return null;
            if (meta.getSize() > 65536) throw new IOException("Package manifest too large");
            Map<String,String> data = parse(zip.getInputStream(meta));
            String id = value(data, "id");
            if (value(data, "type").length() > 0 || !validId(id)) return null;
            return id;
        } finally { zip.close(); }
    }

    static boolean validId(String id) {
        return id != null && id.length() > 0 && id.length() <= 64 &&
            id.matches("[A-Za-z0-9_-][A-Za-z0-9._-]*") && id.indexOf("..") < 0;
    }

    /** Prevent .., absolute targets and symlink escapes from making a USB script run elsewhere. */
    static File resolveInside(File root, String rel) throws IOException {
        if (rel == null || rel.length() == 0 || rel.startsWith("/") || rel.indexOf('\\') >= 0 ||
                rel.indexOf("..") >= 0 || rel.indexOf('\u0000') >= 0)
            throw new IOException("Unsafe or empty relative path");
        File base = root.getCanonicalFile();
        File target = new File(root, rel).getCanonicalFile();
        if (!target.getPath().startsWith(base.getPath() + File.separator))
            throw new IOException("Path escapes package folder");
        return target;
    }

    public static Map<String,String> parse(File file) throws IOException {
        if (file.length() > 65536) throw new IOException("Manifest too large");
        InputStream in = new FileInputStream(file);
        try { return parse(in); } finally { in.close(); }
    }
    public static Map<String,String> parse(InputStream in) throws IOException {
        BufferedReader br = new BufferedReader(new InputStreamReader(in, "UTF-8"));
        HashMap<String,String> data = new HashMap<String,String>();
        boolean nemesis = false;
        String line;
        int n = 0;
        while ((line = br.readLine()) != null && n++ < 1000) {
            line = line.trim();
            if (line.startsWith("[") && line.endsWith("]")) {
                nemesis = "[nemesis]".equalsIgnoreCase(line); continue;
            }
            if (!nemesis || line.startsWith("#") || line.startsWith(";") || line.length() == 0) continue;
            int at = line.indexOf('=');
            if (at > 0) data.put(line.substring(0,at).trim().toLowerCase(), line.substring(at + 1).trim());
        }
        return data;
    }
    private static String value(Map<String,String> m, String key) {
        String s = m.get(key); return s == null ? "" : s;
    }
}
