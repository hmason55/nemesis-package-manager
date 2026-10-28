@echo off
setlocal
pushd "%~dp0"
where py >nul 2>nul
if errorlevel 1 (
    python -m tools.usb_companion %*
) else (
    py -3 -m tools.usb_companion %*
)
if errorlevel 1 pause
popd
