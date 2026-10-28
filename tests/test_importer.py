import importlib.util
import io
import tempfile
import unittest
import zipfile
from pathlib import Path

P = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('import_release', P/'tools/import_release.py')
mod = importlib.util.module_from_spec(spec); spec.loader.exec_module(mod)

class ImportTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(); self.base=Path(self.temp.name)
        self.usb=self.base/'usb'
    def tearDown(self): self.temp.cleanup()
    def archive(self,name,files):
        f=self.base/name
        with zipfile.ZipFile(f,'w') as z:
            for k,v in files.items(): z.writestr(k,v)
        return f
    def test_usb_bundle_preserves_data(self):
        release=self.archive('tool-usb.zip',{'NEMESIS.data':'[nemesis]\ntype=install\npath=packages/foo.zip\n', 'packages/foo.zip':'payload'})
        dest,kind=mod.import_release(release,self.usb,'foo')
        self.assertEqual(kind,'usb')
        self.assertTrue((dest/'packages/foo.zip').exists())
        self.assertFalse((self.usb/'NEMESIS.data').exists())
        (dest/'data'/'recording.mp4').write_bytes(b'my-video')
        mod.import_release(release,self.usb,'foo',True)
        self.assertEqual((dest/'data'/'recording.mp4').read_bytes(),b'my-video')
    def test_raw_package(self):
        release=self.archive('pkg.zip', {'NEMESIS.data':'[nemesis]\nid=great.tool\n[app.0]\nkind=sh\npath=tool.sh\n','tool.sh':'exit 0'})
        dest,kind=mod.import_release(release,self.usb,'great')
        self.assertEqual(kind,'pkg')
        self.assertIn('path=payload.zip',(dest/'NEMESIS.data').read_text())
        self.assertTrue((dest/'payload.zip').is_file())
    def test_reject_traversal(self):
        release=self.archive('bad.zip', {'NEMESIS.data':'[nemesis]\ntype=execute\npath=run.sh\n','../attack':'oops'})
        with self.assertRaises(ValueError): mod.import_release(release,self.usb,'bad')
    def test_reject_existing(self):
        release=self.archive('one.zip', {'NEMESIS.data':'[nemesis]\nid=x\n'})
        mod.import_release(release,self.usb,'x')
        with self.assertRaises(FileExistsError):mod.import_release(release,self.usb,'x')
if __name__=='__main__':unittest.main()
