package dev.nemesis.usbmanager;

/** Source metadata is independent of installation state and local file paths. */
public final class PackageRecord {
    public String id, name, version, description, compatibility, releaseNotes;
    public String publisher, repository;
    public String[] vehicles = new String[0], firmware = new String[0];
    public String nemesisSupport;
    public String sha256, downloadUrl;
    public long size;
    public PackageScanner.Item local;
}
