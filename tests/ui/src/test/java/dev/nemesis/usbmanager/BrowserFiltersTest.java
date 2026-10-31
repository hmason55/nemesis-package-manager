package dev.nemesis.usbmanager;

import org.junit.Test;
import static org.junit.Assert.*;

public class BrowserFiltersTest {
    private PackageScanner.Item row(String title,String id,String kind) {
        PackageScanner.Item item=new PackageScanner.Item();item.title=title;item.id=id;item.kind=kind;return item;
    }
    @Test public void localSearchIncludesInstalledIdentitiesAndCloudPublisherMetadata() {
        PackageScanner.Item installed=row("Local App","example.local","installed");
        assertTrue(BrowserFilters.matches(installed,"LOCAL",0));assertTrue(BrowserFilters.matches(installed,"example.local",1));assertFalse(BrowserFilters.matches(installed,"null",0));
        installed.detail="Offline maps";assertTrue(BrowserFilters.matches(installed,"maps",0));
        installed.remote=new PackageRecord();installed.remote.publisher="Publisher";installed.remote.description="Navigation";
        assertTrue(BrowserFilters.matches(installed,"publisher",0));assertTrue(BrowserFilters.matches(installed,"navigation",0));assertFalse(BrowserFilters.matches(installed,"navigation",2));
        PackageScanner.Item script=row("Script","script",PackageScanner.EXECUTE);assertTrue(BrowserFilters.matches(script,"",2));assertFalse(BrowserFilters.matches(script,"",1));
    }
    @Test public void sortingIsStableAndUnknownDownloadSizesAppearLast() {
        PackageScanner.Item a=row("Alpha","a",PackageScanner.INSTALL),b=row("Beta","b",PackageScanner.INSTALL);
        assertTrue(BrowserFilters.order(0).compare(a,b)<0);assertTrue(BrowserFilters.order(1).compare(a,b)>0);
        a.remote=new PackageRecord();a.remote.size=100;b.remote=new PackageRecord();b.remote.size=50;
        assertTrue(BrowserFilters.order(2).compare(a,b)>0);assertTrue(BrowserFilters.order(2).compare(b,a)<0);
        b.remote=null;assertTrue(BrowserFilters.order(2).compare(a,b)<0);
        a.remote=null;assertTrue(BrowserFilters.order(2).compare(a,b)<0);
        b.title="Alpha";assertTrue(BrowserFilters.order(0).compare(a,b)<0);
        a.target=new java.io.File("missing");assertTrue(BrowserFilters.order(2).compare(a,b)<0);
    }
}
