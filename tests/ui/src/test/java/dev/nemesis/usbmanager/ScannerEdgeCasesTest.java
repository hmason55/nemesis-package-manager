package dev.nemesis.usbmanager;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import java.io.FileOutputStream;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import static org.junit.Assert.*;

public class ScannerEdgeCasesTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();

    @Test public void idsAndRelativePathsRejectUnsafeBoundaries() throws Exception {
        for (String id : new String[] {null, "", ".start", "two..dots", "slash/id", "with space", new String(new char[65]).replace('\0', 'a')}) {
            assertFalse("Rejected ID: " + id, PackageScanner.validId(id));
        }
        assertTrue(PackageScanner.validId(new String(new char[64]).replace('\0', 'a')));
        assertTrue(PackageScanner.validId("_demo-1.app"));
        File root = temporary.newFolder("root");
        for (String path : new String[] {null, "", "/absolute", "..", "a/../b", "a\\b", "bad\0path", "."}) {
            try {
                PackageScanner.resolveInside(root, path);
                fail("Accepted unsafe path: " + path);
            } catch (IOException expected) { assertNotNull(expected.getMessage()); }
        }
        assertEquals(new File(root, "nested/file.zip").getCanonicalFile(), PackageScanner.resolveInside(root, "nested/file.zip"));
    }

    @Test public void parserHandlesCommentsSectionsAndLineLimit() throws Exception {
        String text = "\uFEFF[NEMESIS]\n#comment\n;comment\n\n ID = demo.app \nname=First\nname=Second\ninvalid\n=ignored\n[other]\nid=not.nemesis\n[nemesis]\nversion=2\n";
        Map<String, String> result = PackageScanner.parse(new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8)));
        assertEquals("demo.app", result.get("id"));
        assertEquals("Second", result.get("name"));
        assertEquals("2", result.get("version"));
        assertFalse(result.containsKey(""));
        StringBuilder many = new StringBuilder("[nemesis]\n");
        for (int i = 1; i < 1000; i++) many.append("# ignored\n");
        many.append("id=outside.limit\n");
        assertFalse(PackageScanner.parse(new ByteArrayInputStream(many.toString().getBytes(StandardCharsets.UTF_8))).containsKey("id"));
        File large = temporary.newFile("large.data");
        ScannerTest.write(large, new String(new char[65537]).replace('\0', 'x'));
        try { PackageScanner.parse(large); fail("Oversized file accepted"); }
        catch (IOException expected) { assertTrue(expected.getMessage().contains("too large")); }
    }

    @Test public void archivesRejectAmbiguousDeepAndInvalidMetadata() throws Exception {
        String[][] entries = {
            {"one/NEMESIS.data", "two/NEMESIS.data"},
            {"deep/nested/NEMESIS.data"},
            {"/NEMESIS.data"},
            {"unrelated.txt"}
        };
        for (int i = 0; i < entries.length; i++) {
            File file = temporary.newFile("archive-" + i + ".zip");
            try (ZipOutputStream zip = new ZipOutputStream(new FileOutputStream(file))) {
                for (String name : entries[i]) {
                    zip.putNextEntry(new ZipEntry(name));
                    zip.write("[nemesis]\nid=demo.app\n".getBytes(StandardCharsets.UTF_8));
                    zip.closeEntry();
                }
            }
            assertNull(PackageScanner.readZipId(file));
        }
        for (String metadata : new String[] {"[nemesis]\nid=bad..id\n", "[nemesis]\nid=demo.app\ntype=install\n"}) {
            File file = temporary.newFile();
            ScannerTest.zip(file, metadata, false);
            assertNull(PackageScanner.readZipId(file));
        }
        File large = temporary.newFile("large.zip");
        ScannerTest.zip(large, new String(new char[65537]).replace('\0', 'x'), false);
        try { PackageScanner.readZipId(large); fail("Oversized ZIP manifest accepted"); }
        catch (IOException expected) { assertTrue(expected.getMessage().contains("too large")); }
        File valid = temporary.newFile("valid.zip");
        ScannerTest.zip(valid, "[nemesis]\nid=demo.app\n", true);
        assertEquals("demo.app", PackageScanner.readZipId(valid));
    }

    @Test public void discoveryIgnoresNoiseAndExplainsBrokenDescriptors() throws Exception {
        assertTrue(PackageScanner.scan(null).isEmpty());
        assertTrue(PackageScanner.scan(temporary.getRoot()).isEmpty());
        File packages = temporary.newFolder("packages");
        ScannerTest.write(new File(packages, ".hidden/NEMESIS.data"), "[nemesis]\nid=hidden.app\n");
        ScannerTest.write(new File(packages, "notes.txt"), "not an installer");
        ScannerTest.write(new File(packages, "Loose/notes.txt"), "not an installer");
        assertTrue(new File(packages, "Loose/nested.zip").mkdirs());
        String[] descriptors = {
            "[nemesis]\ntype=install\npath=missing.zip\n",
            "[nemesis]\ntype=install\npath=run.sh\n",
            "[nemesis]\ntype=unsupported\n",
            "[nemesis]\nid=bad..id\n",
            "[nemesis]\ntype=install\npath=bad.zip\n"
        };
        for (int i = 0; i < descriptors.length; i++) {
            File folder = new File(packages, "Broken" + i);
            ScannerTest.write(new File(folder, "NEMESIS.data"), descriptors[i]);
            ScannerTest.write(new File(folder, "run.sh"), "echo test\n");
            ScannerTest.zip(new File(folder, "bad.zip"), "[nemesis]\nid=bad..id\n", false);
        }
        ScannerTest.zip(new File(packages, "Loose/unnamed.ZIP"), "[nemesis]\nid=unnamed.app\n", false);
        ScannerTest.zip(new File(packages, "Friendly/inner.zip"), "[nemesis]\nid=friendly.app\nname=From ZIP\n", false);
        ScannerTest.write(new File(packages, "Friendly/NEMESIS.data"), "[nemesis]\ntype=install\npath=inner.zip\n");
        ScannerTest.write(new File(packages, "corrupt.zip"), "not a ZIP");
        ArrayList<PackageScanner.Item> items = PackageScanner.scan(temporary.getRoot());
        assertEquals(8, items.size());
        int broken = 0;
        for (PackageScanner.Item item : items) {
            if (PackageScanner.BROKEN.equals(item.kind)) { broken++; assertNotNull(item.error); }
            if ("unnamed.app".equals(item.id)) assertEquals("unnamed.ZIP", item.title);
            if ("friendly.app".equals(item.id)) assertEquals("From ZIP", item.title);
        }
        assertEquals(6, broken);
    }
}
