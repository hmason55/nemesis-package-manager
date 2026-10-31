package dev.nemesis.usbmanager;

import java.util.Comparator;
import java.util.Locale;

/** Source-neutral local search and ordering, including offline installed rows. */
final class BrowserFilters {
    private BrowserFilters() { }
    static boolean matches(PackageScanner.Item item, String query, int type) {
        if (type == 1 && PackageScanner.EXECUTE.equals(item.kind)) return false;
        if (type == 2 && !PackageScanner.EXECUTE.equals(item.kind)) return false;
        String text = PackagePresentation.name(item) + " " + part(item.id) + " " + part(item.detail);
        if (item.remote != null) text += " " + part(item.remote.publisher) + " " + part(item.remote.description);
        return text.toLowerCase(Locale.ROOT).contains(query.trim().toLowerCase(Locale.ROOT));
    }
    private static String part(String value) { return value == null ? "" : value; }
    static Comparator<PackageScanner.Item> order(final int sort) {
        return new Comparator<PackageScanner.Item>() {
            public int compare(PackageScanner.Item a, PackageScanner.Item b) {
                if (sort == 2) {
                    long x = size(a), y = size(b);
                    if (x != y) return x < y ? -1 : 1;
                }
                int name = PackagePresentation.name(a).compareToIgnoreCase(PackagePresentation.name(b));
                if (sort == 1) name = -name;
                return name == 0 ? PackagePresentation.key(a).compareTo(PackagePresentation.key(b)) : name;
            }
        };
    }
    private static long size(PackageScanner.Item item) {
        return item.remote != null ? item.remote.size : item.target != null ? item.target.length() : Long.MAX_VALUE;
    }
}
