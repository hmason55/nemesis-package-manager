package dev.nemesis.usbmanager;

import java.util.List;

public interface PackageSource {
    interface Progress { void update(long received, long total); boolean cancelled(); }
    List<PackageRecord> list(String query) throws Exception;
    PackageScanner.Item acquire(PackageRecord record, Progress progress) throws Exception;
}
