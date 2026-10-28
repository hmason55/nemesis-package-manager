package dev.nemesis.usbmanager;

import android.content.Context;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.IOException;
import java.util.ArrayList;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

final class NemesisCli {
    static final class Result {
        int rc;
        String out;
        String operation;
        Result(int rc, String out) { this.rc = rc; this.out = out; }
    }
    private NemesisCli() { }
    static Result run(String... args) {
        try {
            ArrayList<String> command = new ArrayList<String>();
            command.add("/system/xbin/nemesis");
            for (String arg : args) command.add(arg);
            ProcessBuilder pb = new ProcessBuilder(command);
            pb.redirectErrorStream(true);
            Process p = pb.start();
            p.getOutputStream().close();
            InputStream in = p.getInputStream();
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) >= 0) {
                if (out.size() < 256 * 1024) out.write(buf, 0, Math.min(n, 256 * 1024 - out.size()));
            }
            in.close();
            int rc = p.waitFor();
            return new Result(rc, out.toString("UTF-8"));
        } catch (Exception e) { return new Result(1, e.toString()); }
    }

    static Result install(Context context, PackageScanner.Item item) {
        File zip = item.target;
        boolean temporary = PackageScanner.RAW.equals(item.kind);
        if (temporary) {
            try {
                zip = File.createTempFile("source-package-", ".zip", context.getCacheDir());
                zipDirectory(item.folder, zip);
            } catch (Exception e) {
                if (zip != item.target) zip.delete();
                return new Result(1, "Could not package source folder: " + e.getMessage());
            }
        }
        try {
            Result info = run("pkg-info", zip.getAbsolutePath());
            if (info.rc != 0) return info;
            String id = findInfo(info.out, "id");
            if (!PackageScanner.validId(id)) return new Result(1, "Invalid package id: " + id);
            boolean installed = "1".equals(findInfo(info.out, "installed"));
            if ("1".equals(findInfo(info.out, "locked"))) return new Result(1, "Package is locked");
            Result result = installed ? run("install", "--update", zip.getAbsolutePath()) : run("install", zip.getAbsolutePath());
            result.operation = installed ? "update" : "install";
            return result;
        } finally { if (temporary) zip.delete(); }
    }

    private static String findInfo(String out, String key) {
        for (String line : out.split("\\n"))
            if (line.startsWith(key + "=")) return line.substring(key.length() + 1).trim();
        return "";
    }

    static Result updateManager(PackageScanner.Item item) {
        Result metadata = run("pkg-info", item.target.getAbsolutePath());
        if (metadata.rc != 0) return metadata;
        if (!"usb.package.manager".equals(findInfo(metadata.out, "id")))
            return new Result(1, "The selected installer is not Package Manager.");
        // Copy first, then detach from this APK's process before Android replaces it.
        String staged = "/data/local/tmp/package-manager-update-" + System.currentTimeMillis() + ".zip";
        File marker = new File(staged + ".result");
        String command = "mkdir -p /data/nemesis/logs || exit 1; cp " + quote(item.target.getAbsolutePath()) + " " + quote(staged) +
            " || exit 1; : >/data/nemesis/logs/package-manager-update.log || exit 1; (sleep 3; /system/xbin/nemesis install --update " + quote(staged) +
            "; result=$?; printf '%s\\n' \"$result\" >" + quote(marker.getAbsolutePath() + ".tmp") +
            "; chmod 644 " + quote(marker.getAbsolutePath() + ".tmp") +
            "; mv " + quote(marker.getAbsolutePath() + ".tmp") + " " + quote(marker.getAbsolutePath()) +
            "; rm -f " + quote(staged) +
            "; echo Update_exit_code=$result; /system/xbin/nemesis pkg-launch usb.package.manager)" +
            " </dev/null >/data/nemesis/logs/package-manager-update.log 2>&1 &";
        Result result = run("root", "-c", command);
        if (result.rc == 0) {
            try {
                result = new Result(UpdateHandoff.awaitResult(marker),
                    "NEMESIS update result received. Log: /data/nemesis/logs/package-manager-update.log");
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                return new Result(1, "Update monitoring interrupted; inspect the NEMESIS update log before starting another operation.");
            } catch (IOException error) {
                return new Result(1, "Could not read update result: " + error.toString());
            }
        }
        result.operation = "update";
        return result;
    }

    private static String quote(String value) { return "'" + value.replace("'", "'\\''") + "'"; }

    static Result execute(PackageScanner.Item item) {
        try {
            String dir = item.folder.getCanonicalPath();
            String script = item.target.getCanonicalPath();
            // Shell injection impossible: use only safe absolute-path characters in this prototype.
            if (!dir.matches("[A-Za-z0-9_./ -]+") || !script.matches("[A-Za-z0-9_./ -]+"))
                return new Result(1, "Unsafe shell path characters; rename package folder");
            return run("root", "-c", "cd '" + dir + "' && /system/bin/sh '" + script + "'");
        } catch (IOException e) { return new Result(1, e.toString()); }
    }

    private static void zipDirectory(File src, File output) throws IOException {
        ZipOutputStream zos = new ZipOutputStream(new FileOutputStream(output));
        try { addDir(src, src, zos, 0); } finally { zos.close(); }
    }
    private static void addDir(File base, File dir, ZipOutputStream zos, int depth) throws IOException {
        if (depth > 16) throw new IOException("Folder nesting too deep");
        File[] list = dir.listFiles();
        if (list == null) throw new IOException("Folder cannot be read: " + dir.getPath());
        for (File f : list) {
            if ((dir.equals(base) && f.getName().equalsIgnoreCase("data")) || f.getName().equals(".git") || f.getName().equals(".DS_Store")) continue;
            if (!f.getCanonicalPath().startsWith(base.getCanonicalPath() + File.separator))
                throw new IOException("Symlink escapes source folder: " + f.getName());
            if (f.isDirectory()) { addDir(base, f, zos, depth + 1); continue; }
            if (!f.isFile()) continue;
            String path = f.getCanonicalPath().substring(base.getCanonicalPath().length() + 1).replace(File.separatorChar, '/');
            ZipEntry ze = new ZipEntry(path);
            zos.putNextEntry(ze);
            FileInputStream input = new FileInputStream(f);
            try {
                byte[] b = new byte[16384]; int n;
                while ((n = input.read(b)) > 0) zos.write(b, 0, n);
            } finally { input.close(); }
            zos.closeEntry();
        }
    }
}
