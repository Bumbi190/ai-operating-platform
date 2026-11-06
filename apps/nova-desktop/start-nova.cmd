@echo off
setlocal
cd /d "%~dp0"
where pythonw.exe >nul 2>&1
if %errorlevel%==0 (
  start "" pythonw.exe "%~dp0nova_desktop.py"
  exit /b 0
)
where pyw.exe >nul 2>&1
if %errorlevel%==0 (
  start "" pyw.exe -3 "%~dp0nova_desktop.py"
  exit /b 0
)
echo Python 3 med tkinter kravs. Ingen installation har gjorts.
pause
exit /b 1
