package dev.nemesis.usbmanager;

import java.nio.file.Files;
import org.junit.Test;

public class HostRegressionTest {
    @Test public void scanner() throws Exception {
        ScannerTest.main(new String[] {Files.createTempDirectory("scanner-").toString()});
    }
    @Test public void registry() { InstalledPackagesTest.main(new String[0]); }
    @Test public void presentation() { PackagePresentationTest.main(new String[0]); }
    @Test public void coordinator() throws Exception { OperationCoordinatorTest.main(new String[0]); }
}
