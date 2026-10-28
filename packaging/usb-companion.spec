# Build on each target OS: python -m PyInstaller packaging/usb-companion.spec
from pathlib import Path

root = Path(SPECPATH).parent
analysis = Analysis(
    [str(root / "tools" / "usb_companion.py")],
    pathex=[str(root)],
    datas=[(str(root / "tools" / "companion_ui"), "tools/companion_ui")],
    hiddenimports=[],
    hookspath=[],
    runtime_hooks=[],
    excludes=["tkinter", "unittest"],
    noarchive=False,
)
archive = PYZ(analysis.pure)
exe = EXE(
    archive,
    analysis.scripts,
    analysis.binaries,
    analysis.datas,
    [],
    name="nemesis-usb-companion",
    debug=False,
    strip=False,
    upx=False,
    console=True,
)
