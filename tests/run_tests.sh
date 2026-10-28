#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
python3 -m unittest discover -s tests -p 'test_*.py' -v
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
javac -d "$TMP/classes" app/src/main/java/dev/nemesis/usbmanager/PackageScanner.java tests/ScannerTest.java
java -cp "$TMP/classes" dev.nemesis.usbmanager.ScannerTest "$TMP/usb"
javac -source 7 -target 7 -cp "$TMP/classes" -d "$TMP/classes" app/src/main/java/dev/nemesis/usbmanager/InstalledPackages.java tests/InstalledPackagesTest.java
java -cp "$TMP/classes" dev.nemesis.usbmanager.InstalledPackagesTest
javac -source 7 -target 7 -d "$TMP/classes" app/src/main/java/dev/nemesis/usbmanager/OperationCoordinator.java tests/OperationCoordinatorTest.java
java -cp "$TMP/classes" dev.nemesis.usbmanager.OperationCoordinatorTest
javac -source 7 -target 7 -cp "$TMP/classes" -d "$TMP/classes" app/src/main/java/dev/nemesis/usbmanager/PackagePresentation.java tests/PackagePresentationTest.java
java -cp "$TMP/classes" dev.nemesis.usbmanager.PackagePresentationTest
python3 - <<'PY'
import tempfile
from pathlib import Path
from tools.build_release import build
from zipfile import ZipFile
with tempfile.TemporaryDirectory() as tmp:
    base=Path(tmp)
    apk=base/'test.apk'
    # Test fixture has the shape of an APK, not a working Android application.
    with ZipFile(apk,'w') as z:
        z.writestr('AndroidManifest.xml',b'fixture')
        z.writestr('classes.dex',b'fixture' + b'X'*2048)
        z.writestr('META-INF/DEBUG.RSA',b'fixture')
    build(apk,base/'dist')
    with ZipFile(base/'dist/usb-package-manager-ready.zip') as z:
        assert 'NEMESIS.data' in z.namelist()
        assert 'NEMESIS.sh' in z.namelist()
        assert 'manager/usb.package.manager.zip' in z.namelist()
        assert 'GETTING_STARTED.txt' in z.namelist()
        assert 'docs/SETUP-WINDOWS.md' in z.namelist()
        assert 'docs/RELEASE-LAYOUTS.md' in z.namelist()
        assert 'type=execute' in z.read('NEMESIS.data').decode()
        (base/'launcher.sh').write_bytes(z.read('NEMESIS.sh'))
    import subprocess
    subprocess.run(['sh','-n',str(base/'launcher.sh')],check=True)
print('Bundle structure and launcher shell syntax: passed')
PY
