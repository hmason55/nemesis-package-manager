package dev.nemesis.usbmanager;

import java.io.File;
import java.util.ArrayList;
import java.util.List;

public final class UsbPackageSource implements PackageSource {
    private final File root;
    public UsbPackageSource(File root) { this.root = root; }
    public List<PackageRecord> list(String query) {
        ArrayList<PackageRecord> records = new ArrayList<PackageRecord>();
        for (PackageScanner.Item item : PackageScanner.scan(root)) {
            if (query != null && query.length() > 0 && !item.title.toLowerCase(java.util.Locale.US).contains(query.toLowerCase(java.util.Locale.US))) continue;
            PackageRecord record = new PackageRecord();
            record.id = item.id; record.name = item.title; record.version = item.version; record.local = item;
            records.add(record);
        }
        return records;
    }
    public PackageScanner.Item acquire(PackageRecord record, Progress progress) { return record.local; }
}
