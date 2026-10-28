package dev.nemesis.usbmanager;

import android.content.Context;
import android.content.ContextWrapper;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.zip.ZipFile;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;
import static org.junit.Assert.*;

public class NemesisCliTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();

    private static class FakeProcess extends Process {
        final ByteArrayOutputStream stdin = new ByteArrayOutputStream();
        final InputStream stdout;
        final int status;
        boolean closed;
        FakeProcess(byte[] output, int status) {
            this.stdout = new ByteArrayInputStream(output);
            this.status = status;
        }
        public OutputStream getOutputStream() {
            return new OutputStream() {
                public void write(int value) { stdin.write(value); }
                public void close() { closed = true; }
            };
        }
        public InputStream getInputStream() { return stdout; }
        public InputStream getErrorStream() { return new ByteArrayInputStream(new byte[0]); }
        public int waitFor() { return status; }
        public int exitValue() { return status; }
        public void destroy() { }
    }

    @Test public void processArgumentsRemainSeparateAndFailuresRetainOutput() {
        final FakeProcess process = new FakeProcess("diagnostic é\n".getBytes(StandardCharsets.UTF_8), 7);
        final List<String> seen = new ArrayList<String>();
        NemesisCli.Result result = NemesisCli.run(command -> {
            seen.addAll(command);
            return process;
        }, "install", "a file;echo unwanted.zip");
        assertEquals(Arrays.asList("/system/xbin/nemesis", "install", "a file;echo unwanted.zip"), seen);
        assertTrue(process.closed);
        assertEquals(7, result.rc);
        assertEquals("diagnostic é\n", result.out);
    }

    @Test public void processOutputIsCappedWithoutLosingExitStatus() throws Exception {
        byte[] large = new byte[300 * 1024];
        Arrays.fill(large, (byte) 'x');
        FakeProcess process = new FakeProcess(large, 9);
        NemesisCli.Result result = NemesisCli.run(command -> process, "pkg-list");
        assertEquals(256 * 1024, result.out.length());
        assertEquals(9, result.rc);
        assertEquals("Output beyond the cap must still be drained", 0, process.stdout.available());
        assertEquals("", NemesisCli.run(command -> new FakeProcess(new byte[0], 0)).out);
    }

    @Test public void processStartAndReadErrorsBecomeVisibleFailures() {
        NemesisCli.Result start = NemesisCli.run(command -> { throw new IOException("channel unavailable"); });
        assertEquals(1, start.rc);
        assertTrue(start.out.contains("channel unavailable"));
        NemesisCli.Result read = NemesisCli.run(command -> new FakeProcess(new byte[0], 0) {
            public InputStream getInputStream() {
                return new InputStream() {
                    public int read() throws IOException { throw new IOException("broken pipe"); }
                };
            }
        });
        assertEquals(1, read.rc);
        assertTrue(read.out.contains("broken pipe"));
    }

    private File canonical(final String path) {
        return new File("fixture") {
            @Override public String getCanonicalPath() throws IOException {
                if (path == null) throw new IOException("cannot resolve source");
                return path;
            }
        };
    }

    @Test public void scriptsUseQuotedSafePathsAndRejectShellCharactersBeforeExecution() {
        PackageScanner.Item item = new PackageScanner.Item();
        item.folder = canonical("/fixture/a folder");
        item.target = canonical("/fixture/a folder/run.sh");
        List<List<String>> calls = new ArrayList<List<String>>();
        NemesisCli.CommandRunner commands = args -> {
            calls.add(Arrays.asList(args));
            return new NemesisCli.Result(8, "script failed");
        };
        NemesisCli.Result result = NemesisCli.execute(item, commands);
        assertEquals(8, result.rc);
        assertEquals(Arrays.asList("root", "-c", "cd '/fixture/a folder' && /system/bin/sh '/fixture/a folder/run.sh'"), calls.get(0));
        calls.clear();
        item.folder = canonical("/fixture/$(bad)");
        assertTrue(NemesisCli.execute(item, commands).out.contains("Unsafe shell path"));
        item.folder = canonical("/fixture/safe");
        item.target = canonical("/fixture/safe/script'bad.sh");
        assertTrue(NemesisCli.execute(item, commands).out.contains("Unsafe shell path"));
        item.target = canonical(null);
        assertTrue(NemesisCli.execute(item, commands).out.contains("cannot resolve source"));
        assertTrue(calls.isEmpty());
    }

    @Test public void metadataControlsInstallUpdateAndLockProtection() throws Exception {
        for (boolean installed : new boolean[] {false, true}) {
            PackageScanner.Item item = installerWithName("bundle-" + installed + ".zip");
            List<List<String>> calls = new ArrayList<List<String>>();
            NemesisCli.Result result = NemesisCli.install(null, item, args -> {
                calls.add(Arrays.asList(args));
                if ("pkg-info".equals(args[0])) {
                    return new NemesisCli.Result(0, "ignored=value\nid=demo.app\ninstalled=" + (installed ? "1" : "0") + "\nlocked=0\n");
                }
                return new NemesisCli.Result(4, "install failure");
            });
            assertEquals(Arrays.asList("pkg-info", item.target.getAbsolutePath()), calls.get(0));
            assertEquals(installed ? Arrays.asList("install", "--update", item.target.getAbsolutePath()) :
                Arrays.asList("install", item.target.getAbsolutePath()), calls.get(1));
            assertEquals(installed ? "update" : "install", result.operation);
            assertEquals(4, result.rc);
            assertTrue(item.target.isFile());
        }
        for (String metadata : new String[] {"id=bad..id\n", "name=no id\n", "id=demo.app\nlocked=1\n"}) {
            List<String> calls = new ArrayList<String>();
            NemesisCli.Result result = NemesisCli.install(null, installerWithName("invalid-" + metadata.hashCode() + ".zip"), args -> {
                calls.add(args[0]);
                return new NemesisCli.Result(0, metadata);
            });
            assertEquals(1, result.rc);
            assertEquals(Arrays.asList("pkg-info"), calls);
            assertTrue(result.out.contains(metadata.contains("locked=1") ? "locked" : "Invalid package id"));
        }
    }

    private PackageScanner.Item installerWithName(String name) throws IOException {
        PackageScanner.Item item = new PackageScanner.Item();
        item.kind = PackageScanner.INSTALL;
        item.target = temporary.newFile(name);
        return item;
    }

    private Context cache(final File directory) {
        return new ContextWrapper(null) {
            @Override public File getCacheDir() { return directory; }
        };
    }

    @Test public void rawInstallerIsRemovedAfterSuccessfulInstallation() throws Exception {
        File source = temporary.newFolder("source-success");
        ScannerTest.write(new File(source, "NEMESIS.data"), "[nemesis]\nid=demo.app\n");
        PackageScanner.Item item = new PackageScanner.Item();
        item.kind = PackageScanner.RAW;
        item.folder = source;
        item.target = source;
        File directory = temporary.newFolder("cache-success");
        List<List<String>> calls = new ArrayList<List<String>>();
        NemesisCli.Result result = NemesisCli.install(cache(directory), item, args -> {
            calls.add(Arrays.asList(args));
            assertTrue(new File(args[1]).isFile());
            return new NemesisCli.Result(0, "pkg-info".equals(args[0]) ? "id=demo.app\ninstalled=0\n" : "installed");
        });
        assertEquals(0, result.rc);
        assertEquals("install", result.operation);
        assertEquals(2, calls.size());
        assertEquals(calls.get(0).get(1), calls.get(1).get(1));
        assertEquals(0, directory.list().length);
        assertTrue(new File(source, "NEMESIS.data").isFile());
    }

    @Test public void rawArchivePreservesDataAndCleansTemporaryInstallerAfterFailure() throws Exception {
        File source = temporary.newFolder("source");
        ScannerTest.write(new File(source, "NEMESIS.data"), "[nemesis]\nid=demo.app\n");
        ScannerTest.write(new File(source, "bin/run.sh"), "echo test\n");
        ScannerTest.write(new File(source, "bin/data/asset.txt"), "keep nested assets");
        for (String ignored : new String[] {"DATA/export.txt", ".git/config", ".DS_Store"}) {
            ScannerTest.write(new File(source, ignored), "private data");
        }
        PackageScanner.Item item = new PackageScanner.Item();
        item.kind = PackageScanner.RAW;
        item.folder = source;
        item.target = source;
        File cache = temporary.newFolder("cache");
        List<File> staged = new ArrayList<File>();
        NemesisCli.Result result = NemesisCli.install(cache(cache), item, args -> {
            File archive = new File(args[1]);
            staged.add(archive);
            try (ZipFile zip = new ZipFile(archive)) {
                assertNotNull(zip.getEntry("NEMESIS.data"));
                assertNotNull(zip.getEntry("bin/run.sh"));
                assertNotNull(zip.getEntry("bin/data/asset.txt"));
                assertNull(zip.getEntry("DATA/export.txt"));
                assertNull(zip.getEntry(".git/config"));
                assertNull(zip.getEntry(".DS_Store"));
            } catch (IOException error) { throw new AssertionError(error); }
            return new NemesisCli.Result(5, "metadata rejected");
        });
        assertEquals(5, result.rc);
        assertEquals(1, staged.size());
        assertFalse(staged.get(0).exists());
        assertEquals(0, cache.list().length);
        assertTrue(new File(source, "DATA/export.txt").isFile());
    }

    @Test public void unreadableSourceExcessiveNestingAndBadCacheDoNotRunCommands() throws Exception {
        File cache = temporary.newFolder("cache");
        File nested = temporary.newFolder("nested");
        File leaf = nested;
        for (int i = 0; i < 18; i++) leaf = new File(leaf, "x");
        assertTrue(leaf.mkdirs());
        File missing = new File(temporary.getRoot(), "missing");
        for (File source : new File[] {nested, missing}) {
            PackageScanner.Item item = new PackageScanner.Item();
            item.kind = PackageScanner.RAW;
            item.folder = source;
            item.target = source;
            NemesisCli.Result result = NemesisCli.install(cache(cache), item, args -> {
                throw new AssertionError("Invalid source reached command execution");
            });
            assertEquals(1, result.rc);
            assertTrue(result.out.contains("Could not package source folder"));
            assertEquals(0, cache.list().length);
        }
        PackageScanner.Item item = new PackageScanner.Item();
        item.kind = PackageScanner.RAW;
        item.folder = nested;
        item.target = nested;
        NemesisCli.Result result = NemesisCli.install(cache(temporary.newFile("not-a-directory")), item,
            args -> { throw new AssertionError("Invalid cache reached command execution"); });
        assertEquals(1, result.rc);
        assertTrue(result.out.contains("Could not package source folder"));
    }
}
