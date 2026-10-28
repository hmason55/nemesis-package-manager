package dev.nemesis.usbmanager;
import java.io.*;
import java.util.*;
import java.util.zip.*;

public class ScannerTest {
    static void check(boolean ok, String msg) { if (!ok) throw new AssertionError(msg); }
    static void write(File f, String body) throws Exception {
        f.getParentFile().mkdirs();
        try (FileOutputStream o = new FileOutputStream(f)) { o.write(body.getBytes("UTF-8")); }
    }
    static void zip(File f, String manifest, boolean wrapped) throws Exception {
        f.getParentFile().mkdirs();
        try (ZipOutputStream z = new ZipOutputStream(new FileOutputStream(f))) {
            z.putNextEntry(new ZipEntry(wrapped?"package/NEMESIS.data":"NEMESIS.data"));
            z.write(manifest.getBytes("UTF-8")); z.closeEntry();
        }
    }
    public static void main(String[] args) throws Exception {
        File root = new File(args[0]); root.mkdirs();
        String meta="[nemesis]\nid=aaa.test\nname=Test\nversion=1.2\ntypes=application\n[app.0]\nkind=sh\npath=bin/go.sh\n";
        File named = new File(root,"packages/Named");
        zip(new File(named,"packages/one.zip"),meta,false);
        write(new File(named,"NEMESIS.data"),"[nemesis]\ntype=install\npath=packages/one.zip\nname=Named\n");
        File script = new File(root,"packages/Script");
        write(new File(script,"NEMESIS.data"),"[nemesis]\ntype=execute\npath=run.sh\n");
        write(new File(script,"run.sh"),"#!/system/bin/sh\nexit 0\n");
        File raw = new File(root,"packages/Source");
        write(new File(raw,"NEMESIS.data"),meta);
        File bad = new File(root,"packages/Bad");
        write(new File(bad,"NEMESIS.data"),"[nemesis]\ntype=execute\npath=../outside.sh\n");
        zip(new File(root,"packages/wrapped.zip"),meta,true);
        ArrayList<PackageScanner.Item> rows = PackageScanner.scan(root);
        check(rows.size()==5,"expected 5 rows, got "+rows.size());
        Map<String,PackageScanner.Item> byName=new HashMap<>();
        for(PackageScanner.Item i:rows) byName.put(i.title,i);
        check("install".equals(byName.get("Named").kind),"installer");
        check("aaa.test".equals(byName.get("Named").id),"zip metadata");
        check("execute".equals(byName.get("Script").kind),"execute");
        PackageScanner.Item source = null, wrapped = null;
        for (PackageScanner.Item item : rows) {
            if ("raw".equals(item.kind)) source = item;
            if (item.target != null && item.target.getName().equals("wrapped.zip")) wrapped = item;
        }
        check(source != null && "Test".equals(source.title),"source");
        check("invalid".equals(byName.get("Bad").kind),"unsafe traversal rejected");
        check(wrapped != null && "install".equals(wrapped.kind),"wrapped zip");
        check("Test".equals(wrapped.title) && "1.2".equals(wrapped.version),"friendly ZIP name and version");
        check(wrapped.dataDir().getPath().contains("wrapped"),"unique data dir");
        check("aaa.test".equals(PackageScanner.parse(new ByteArrayInputStream(("\uFEFF"+meta).getBytes("UTF-8"))).get("id")),"Windows UTF-8 BOM");
        System.out.println("PackageScanner: all checks passed");
    }
}
