package dev.nemesis.usbmanager;

import android.content.Context;
import java.io.*;
import java.net.URL;
import java.security.MessageDigest;
import java.security.cert.Certificate;
import java.util.*;
import java.util.zip.*;
import javax.net.ssl.HttpsURLConnection;
import org.json.*;
import org.junit.*;
import org.junit.rules.TemporaryFolder;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import static org.junit.Assert.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=19,manifest=Config.NONE)
public class CloudRegistryTest {
    @Rule public TemporaryFolder temporary = new TemporaryFolder();
    private final String base = "https://registry.test";
    private byte[] archive;
    private PackageRecord record;
    private int downloads;
    private boolean withdrawn;
    private String overrideDownload;
    private int responseCode = 200;
    private Integer nextPage;
    private byte[] overrideJson;
    private byte[] zip(String id, String version, String extra) throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(); ZipOutputStream zip = new ZipOutputStream(bytes);
        zip.putNextEntry(new ZipEntry("NEMESIS.data")); zip.write(("[nemesis]\nid="+id+"\nversion="+version+"\n").getBytes("UTF-8")); zip.closeEntry();
        if(extra!=null) {zip.putNextEntry(new ZipEntry(extra));zip.write("content".getBytes("UTF-8"));zip.closeEntry();} zip.close();return bytes.toByteArray();
    }
    private String digest(byte[] bytes) throws Exception {StringBuilder result=new StringBuilder();for(byte b:MessageDigest.getInstance("SHA-256").digest(bytes))result.append(String.format("%02x",b&255));return result.toString();}
    @Before public void setup() throws Exception {
        archive=zip("example.app","1.2","install.sh");record=new PackageRecord();record.id="example.app";record.version="1.2";record.name="Example";record.sha256=digest(archive);record.size=archive.length;record.downloadUrl=base+"/v1/packages/example.app/versions/1.2/download";downloads=0;withdrawn=false;responseCode=200;
    }
    private JSONObject metadata() throws Exception {return new JSONObject().put("package_id",record.id).put("version",record.version).put("name",record.name).put("sha256",record.sha256).put("size",record.size).put("download_url",overrideDownload==null?record.downloadUrl:overrideDownload).put("compatibility",new JSONObject().put("vehicles",new JSONArray()).put("firmware",new JSONArray()).put("nemesis",""));}
    private CloudPackageSource source() throws Exception {
        return new CloudPackageSource(base,temporary.getRoot(),new CloudPackageSource.Connections(){public HttpsURLConnection open(String address)throws Exception{
            byte[] content; int status=responseCode;
            if(address.endsWith("/download")){downloads++;content=archive;}
            else if(address.contains("?")){content=new JSONObject().put("packages",new JSONArray().put(new JSONObject().put("id",record.id))).put("next_page",nextPage==null?JSONObject.NULL:nextPage).toString().getBytes("UTF-8");}
            else if(!address.contains("/versions/")){content=new JSONObject().put("versions",new JSONArray().put(metadata())).toString().getBytes("UTF-8");}
            else {content=metadata().toString().getBytes("UTF-8");if(withdrawn)status=404;}
            return new FakeConnection(address,overrideJson==null?content:overrideJson,status);
        }});
    }
    static class FakeConnection extends HttpsURLConnection {
        private final byte[] bytes;private final int status;
        FakeConnection(String url,byte[] bytes,int status)throws Exception{super(new URL(url));this.bytes=bytes;this.status=status;}
        public void connect(){}public void disconnect(){}public boolean usingProxy(){return false;}
        public int getResponseCode(){return status;}public InputStream getInputStream(){return new ByteArrayInputStream(bytes);}
        public String getCipherSuite(){return "TLS";}public Certificate[] getLocalCertificates(){return null;}public Certificate[] getServerCertificates(){return null;}
    }
    private PackageSource.Progress progress(final boolean cancel){return new PackageSource.Progress(){public boolean cancelled(){return cancel;}public void update(long received,long total){assertTrue(received<=total);}};}
    @Test public void discoversAndAcquiresApprovedInstallerAndReusesVerifiedCache()throws Exception{
        CloudPackageSource source=source();List<PackageRecord> records=source.list("Example");assertEquals(1,records.size());assertEquals(record.id,records.get(0).id);
        PackageScanner.Item item=source.acquire(record,progress(false));assertEquals(record.id,item.id);assertEquals(PackageScanner.INSTALL,item.kind);assertTrue(item.target.isFile());assertEquals(1,downloads);
        source.acquire(record,progress(false));assertEquals("Verified cache avoids downloading again",1,downloads);
    }
    @Test public void corruptionCancellationWithdrawalAndRedirectCannotProduceInstaller()throws Exception{
        CloudPackageSource source=source();try{source.acquire(record,progress(true));fail();}catch(IOException expected){}assertEquals(0,sourceCacheCount());
        archive=zip("wrong.app","1.2","install.sh");try{source.acquire(record,progress(false));fail();}catch(IOException expected){}assertEquals(0,sourceCacheCount());
        withdrawn=true;try{source.acquire(record,progress(false));fail();}catch(IOException expected){}
        withdrawn=false;responseCode=302;try{source.list("");fail();}catch(IOException expected){}
    }
    private int sourceCacheCount(){File[] files=new File(temporary.getRoot(),"cloud-installers").listFiles();return files==null?0:files.length;}
    @Test public void manifestIdentityAndUnsafeMembersAreRejectedEvenWithMatchingHash()throws Exception{
        for(String extra:new String[]{"../outside","bad\\path","CON","trailing. "}){
            byte[] bytes=zip(record.id,record.version,extra);File file=temporary.newFile();try(FileOutputStream output=new FileOutputStream(file)){output.write(bytes);}record.size=bytes.length;record.sha256=digest(bytes);
            try{CloudArchive.validate(file,record);fail(extra);}catch(IOException expected){}
        }
        byte[] bytes=zip("wrong.app",record.version,null);File file=temporary.newFile();try(FileOutputStream output=new FileOutputStream(file)){output.write(bytes);}record.size=bytes.length;record.sha256=digest(bytes);try{CloudArchive.validate(file,record);fail();}catch(IOException expected){}
    }
    @Test public void metadataCannotRedirectToUnapprovedHostsAndHttpsIsRequired()throws Exception{
        overrideDownload="https://evil.test/package.zip";try{source().list("");fail();}catch(IOException expected){}
        for(String url:new String[]{"http://registry.test","https://user:password@registry.test","https://registry.test?q=1"})try{new CloudPackageSource(url,temporary.getRoot());fail(url);}catch(IOException expected){}
    }
    @Test public void versionsFollowSharedFixtures()throws Exception{
        File fixtures=new File("../../contracts/fixtures/version-comparison.json");ByteArrayOutputStream bytes=new ByteArrayOutputStream();try(InputStream input=new FileInputStream(fixtures)){byte[] buffer=new byte[4096];int n;while((n=input.read(buffer))!=-1)bytes.write(buffer,0,n);}
        JSONArray cases=new JSONArray(bytes.toString("UTF-8"));for(int i=0;i<cases.length();i++){JSONObject value=cases.getJSONObject(i);Integer result=PackagePresentation.compareVersions(value.getString("candidate"),value.getString("installed"));assertEquals(value.toString(),value.isNull("result")?null:Integer.valueOf(value.getInt("result")),result);}
    }
    @Test public void invalidMetadataPaginationAndOversizedJsonFailClosed()throws Exception{
        String originalId=record.id,originalHash=record.sha256;long size=record.size;
        record.id="../bad";try{source().list("");fail();}catch(IOException expected){}record.id=originalId;
        record.sha256="bad";try{source().list("");fail();}catch(IOException expected){}record.sha256=originalHash;
        for(long invalid:new long[]{0,CloudArchive.MAX_BYTES+1}){record.size=invalid;try{source().list("");fail();}catch(IOException expected){}}record.size=size;
        nextPage=1;try{source().list("");fail();}catch(IOException expected){}nextPage=null;
        overrideJson=new byte[4*1024*1024+1];Arrays.fill(overrideJson,(byte)' ');try{source().list("");fail();}catch(IOException expected){}
    }
    @Test public void corruptCacheIsReplacedAndStalePartialsArePruned()throws Exception{
        CloudPackageSource source=source();PackageScanner.Item first=source.acquire(record,progress(false));
        try(FileOutputStream output=new FileOutputStream(first.target)){output.write(1);}source.acquire(record,progress(false));assertEquals(2,downloads);
        File cache=first.target.getParentFile();new File(cache,"old.partial").createNewFile();File another=new File(cache,"older.zip");another.createNewFile();another.setLastModified(1);
        File recent=new File(cache,"recent.zip");recent.createNewFile();
        first.target.delete();source.acquire(record,progress(false));assertFalse(new File(cache,"old.partial").exists());
        PackageRecord old=new PackageRecord();old.id=record.id;old.version=record.version;old.sha256="a".repeat(64);old.size=record.size;
        try{source.current(old);fail();}catch(IOException expected){}
    }
    @Test public void archiveLimitsAndNestedManifestAreChecked()throws Exception{
        for(String name:new String[]{"/absolute", "part:stream", "bad\\path", "a/../b", "NUL.txt"}){
            byte[] bytes=zip(record.id,record.version,name);File file=temporary.newFile();try(FileOutputStream output=new FileOutputStream(file)){output.write(bytes);}record.size=bytes.length;record.sha256=digest(bytes);try{CloudArchive.validate(file,record);fail(name);}catch(IOException expected){}
        }
        ByteArrayOutputStream bytes=new ByteArrayOutputStream();ZipOutputStream zip=new ZipOutputStream(bytes);zip.putNextEntry(new ZipEntry("wrapper/NEMESIS.data"));zip.write("[nemesis]\nid=example.app\nversion=1.2\n".getBytes("UTF-8"));zip.close();
        File file=temporary.newFile();try(FileOutputStream output=new FileOutputStream(file)){output.write(bytes.toByteArray());}record.size=file.length();record.sha256=digest(bytes.toByteArray());CloudArchive.validate(file,record);
        record.size++;try{CloudArchive.validate(file,record);fail();}catch(IOException expected){}
    }
    @Test public void usbSourceFiltersLocallyAndReturnsExistingInstaller()throws Exception{
        File root=temporary.newFolder();File packages=new File(root,"packages");packages.mkdir();File file=new File(packages,"example.zip");try(FileOutputStream output=new FileOutputStream(file)){output.write(archive);}
        UsbPackageSource source=new UsbPackageSource(root);assertEquals(1,source.list(null).size());assertEquals(0,source.list("missing").size());PackageRecord found=source.list("example").get(0);assertSame(found.local,source.acquire(found,progress(false)));
    }
}
