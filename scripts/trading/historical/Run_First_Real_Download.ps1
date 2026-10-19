# FIRST REAL NQZ6 + ESZ6 historical one-day import.
# The user approved this exact scoped historical day at the previously quoted
# ~$0.010076165 (USD) combined estimate. The importer re-quotes before any
# billable request and refuses increased estimates; provider billing may differ.
# NO unattended/background downloads. NO saving keys. NO retries of paid calls.
$ErrorActionPreference='Stop'
$here=Split-Path -Parent $MyInvocation.MyCommand.Path
$code=Join-Path $here 'databento-first-day-intake.mjs'
$quote=Join-Path $here 'Quote_Result_Public.json'
$root=Join-Path $HOME 'Projects\Omnira\PrivateMarketData'
$target=Join-Path $root 'Databento-NQ-ES-2026-10-15-FIRST-IMPORT'
if(-not(Test-Path $code)){throw 'Missing offline-tested import script'}
if(-not(Test-Path $quote)){throw 'Missing approved saved Databento cost quote'}
if(Test-Path $target){throw 'Import already attempted. DO NOT repeat paid call without inspection.'}
$check=Get-Content -LiteralPath $quote -Raw|ConvertFrom-Json
if($check.status -ne 'FREE_METADATA_ONLY_COMPLETE' -or
 [decimal]$check.combinedEstimatedUSD -gt 0.010076165){
 throw 'Previous metadata quote is not within the user-approved limit.'
}
Write-Host 'Omnira - FORSTA RIKTIGA HISTORISKA NQ + ES-DYGNET' -ForegroundColor Cyan
Write-Host '2026-10-15, NQZ6 + ESZ6, 1-minutscandles.'
Write-Host 'Godkand offert: $0.010076165 USD totalt. Re-check kontrollerar priset innan kop.'
Write-Host 'OBS: Databento debiterar efter faktiska bytes. En offert ar inte en absolut fakturagaranti.'
Write-Host 'Bara EN nedladdning per instrument. Ingen automatisk repetition, inga orders.'
Write-Host 'API-nyckeln sparas aldrig och ska inte skickas till ChatGPT.'
$secret=Read-Host 'Klistra in API-nyckel dolt (ingen text syns)' -AsSecureString
$bstr=[IntPtr]::Zero
try{
 $bstr=[System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
 $env:DATABENTO_API_KEY=[System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
 if(-not (Test-Path $root)){New-Item -ItemType Directory -Path $root -Force|Out-Null}
 & node $code --approved-first-day $quote $target
 if($LASTEXITCODE -ne 0){
  Write-Host 'IMPORT BLOCKED/FAILED. Check the manifest. Do NOT rerun a paid request automatically.' -ForegroundColor Yellow
 }else{
  Write-Host ('DATA KLAR! Filerna ligger lokalt i: '+$target) -ForegroundColor Green
  Write-Host 'Alla resultat ar historiska candles; inga resultat av tradingstrategier.'
 }
}finally{
 Remove-Item Env:DATABENTO_API_KEY -ErrorAction SilentlyContinue
 if($bstr -ne [IntPtr]::Zero){[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)}
 if($secret){$secret.Dispose()}
}
