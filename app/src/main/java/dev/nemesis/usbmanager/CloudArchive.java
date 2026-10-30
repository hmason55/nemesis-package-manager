package dev.nemesis.usbmanager;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.security.MessageDigest;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/** Validate bounded archive contents and approved identity before invoking NEMESIS. */
final class CloudArchive {
    static final long MAX_BYTES = 512L * 1024 * 1024;
    static void validate(File file, PackageRecord record) throws Exception {
        if (file.length() != record.size || record.size <= 0 || record.size > MAX_BYTES) throw new IOException("Installer size mismatch");
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        InputStream input = new FileInputStream(file);
        try { byte[] buffer = new byte[65536]; int n; while ((n = input.read(buffer)) != -1) digest.update(buffer, 0, n); } finally { input.close(); }
        StringBuilder hex = new StringBuilder();
        for (byte b : digest.digest()) hex.append(String.format(java.util.Locale.US, "%02x", b & 255));
        if (!hex.toString().equals(record.sha256)) throw new IOException("Installer SHA-256 mismatch");
        ZipFile zip = new ZipFile(file);
        try {
            int count = 0; long expanded = 0; Set<String> names = new HashSet<String>();
            Enumeration<? extends ZipEntry> entries = zip.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement(); String name = entry.getName();
                if (++count > 20000 || entry.getSize() < 0 || (expanded += entry.getSize()) > 3L * 1024 * 1024 * 1024) throw new IOException("Archive resource limit exceeded");
                if (!names.add(name) || name.startsWith("/") || name.indexOf('\\') >= 0 || name.indexOf(':') >= 0 || name.indexOf('\0') >= 0) throw new IOException("Unsafe archive path");
                for (String part : name.split("/")) if ("..".equals(part) || part.endsWith(".") || part.endsWith(" ") || part.matches("(?i)(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\\..*)?")) throw new IOException("Nonportable archive path");
            }
            // The approved validator rejects symlinks using ZIP Unix attributes. Java 7's
            // ZipEntry cannot expose those flags; the hash binds this file to that check.
            ZipEntry manifest = zip.getEntry("NEMESIS.data");
            if (manifest == null) {
                for (String name : names) if (name.matches("[^/]+/NEMESIS\\.data")) {
                    if (manifest != null) throw new IOException("Ambiguous package manifest");
                    manifest = zip.getEntry(name);
                }
            }
            if (manifest == null || manifest.getSize() > 65536) throw new IOException("Installer manifest missing or too large");
            InputStream meta = zip.getInputStream(manifest); Map<String,String> values;
            try { values = PackageScanner.parse(meta); } finally { meta.close(); }
            if (!record.id.equals(values.get("id")) || !record.version.equals(values.get("version")) || (values.get("type") != null && values.get("type").length() > 0)) throw new IOException("Installer identity mismatch");
        } finally { zip.close(); }
    }
}
