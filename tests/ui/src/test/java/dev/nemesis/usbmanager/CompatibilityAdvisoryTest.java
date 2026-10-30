package dev.nemesis.usbmanager;

import org.junit.Test;
import static org.junit.Assert.*;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;
import org.json.*;

@RunWith(RobolectricTestRunner.class)
@Config(sdk=19,manifest=Config.NONE)
public class CompatibilityAdvisoryTest {
    @Test public void followsSharedCompatibilityFixtures() throws Exception {
        JSONArray fixtures = new JSONArray(new String(java.nio.file.Files.readAllBytes(new java.io.File("../../contracts/fixtures/compatibility.json").toPath()), "UTF-8"));
        for (int i=0;i<fixtures.length();i++) {
            JSONObject fixture=fixtures.getJSONObject(i), declarations=fixture.getJSONObject("declarations"), profile=fixture.getJSONObject("profile");
            PackageRecord record=new PackageRecord(); record.vehicles=values(declarations.getJSONArray("vehicles")); record.firmware=values(declarations.getJSONArray("firmware")); record.nemesisSupport=declarations.getString("nemesis");
            assertEquals(fixture.getString("name"),fixture.getString("status"),CompatibilityAdvisory.status(record,profile.getString("vehicle"),profile.getString("firmware"),profile.getString("nemesis")));
        }
    }
    private String[] values(JSONArray list) throws Exception {String[] values=new String[list.length()];for(int i=0;i<values.length;i++)values[i]=list.getString(i);return values;}
    @Test public void declarationsDistinguishMatchMismatchAndUnknown() {
        assertTrue(CompatibilityAdvisory.assess(null, "1").startsWith("Unknown"));
        assertTrue(CompatibilityAdvisory.assess(new String[0], "1").startsWith("Unknown"));
        assertTrue(CompatibilityAdvisory.assess(new String[]{"1"}, null).startsWith("Unknown"));
        assertTrue(CompatibilityAdvisory.assess(new String[]{"1"}, " ").startsWith("Unknown"));
        assertTrue(CompatibilityAdvisory.assess(new String[]{"IONIQ 5"}, "ioniq 5").startsWith("Match"));
        assertTrue(CompatibilityAdvisory.assess(new String[]{"*"}, "anything").startsWith("Match"));
        assertTrue(CompatibilityAdvisory.assess(new String[]{"1","2"}, "2").startsWith("Match"));
        assertTrue(CompatibilityAdvisory.assess(new String[]{"1"}, "2").startsWith("Warning"));
        for (String range : new String[]{"1+", ">=1", "1.x", "x", "", "1*"})
            assertTrue(range, CompatibilityAdvisory.assess(new String[]{range}, "2").startsWith("Unknown"));
    }
    @Test public void informationalResultsNeverClaimToBlockInstallation() {
        PackageRecord record = new PackageRecord();record.vehicles=new String[]{"other"};record.firmware=new String[]{"old"};record.nemesisSupport="1";
        String text=CompatibilityAdvisory.describe(record,"car","new","2");
        assertTrue(text.contains("Warning"));assertTrue(text.contains("never blocks installation"));
        record.nemesisSupport=" ";assertTrue(CompatibilityAdvisory.describe(record,"","","").contains("Unknown"));
        record.nemesisSupport=null;assertNotNull(CompatibilityAdvisory.describe(record,null,null,null));
    }
}
