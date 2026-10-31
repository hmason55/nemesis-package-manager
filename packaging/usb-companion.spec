# Build on each target OS: python -m PyInstaller packaging/usb-companion.spec
from pathlib import Path
import ssl

root = Path(SPECPATH).parent
# Some Python distributions ship an SSL policy PEM alongside ssl.py. Preserve
# that runtime data rather than weakening certificate verification in the app.
ssl_policy = Path(ssl.__file__).with_name("codex-rejected-cas.pem")
runtime_data = [(str(ssl_policy), ".")] if ssl_policy.is_file() else []
analysis = Analysis(
    [str(root / "tools" / "usb_companion.py")],
    pathex=[str(root)],
    datas=[(str(root / "tools" / "companion_ui"), "tools/companion_ui"), *runtime_data],
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
