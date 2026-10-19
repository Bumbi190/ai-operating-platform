@echo off
title Omnira - EXPLICITLY APPROVED Historical NQ ES First Download
cd /d "%~dp0"
if not exist ".venv\Scripts\python.exe" (
 echo Missing isolated Python env - no download attempted.
 pause
 exit /b 2
)
echo WARNING: This can consume Databento credits. Only run after explicit owner approval.
echo Vendor usage limits/terms must be checked separately.
".venv\Scripts\python.exe" "databento-first-snapshot.py" --quote "Quote_Result_Public.json" --download
echo.
echo If stopped or failed, DO NOT retry until billing and quarantine files are reviewed.
pause
