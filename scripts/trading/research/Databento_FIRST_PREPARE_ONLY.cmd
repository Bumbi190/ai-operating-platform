@echo off
title Omnira - NQ ES Historical Prepare Only (No Charges)
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
  echo Official SDK virtual environment is not installed.
  echo Ask ChatGPT or Claude to finish dependency setup.
  pause
  exit /b 2
)
".venv\Scripts\python.exe" "databento-first-snapshot.py" --quote "Quote_Result_Public.json"
echo.
echo PREPARE ONLY - no historical data was downloaded.
pause
