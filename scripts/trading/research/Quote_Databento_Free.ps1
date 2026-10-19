# Metadata-only Databento quote: local Windows operator launcher.
# Requires an existing Databento historical account and an API key.
# No persistent credential storage; no download/purchase API exists here.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$engine = Join-Path $here 'databento-free-metadata-only.mjs'
if (-not (Test-Path -LiteralPath $engine)) {
    throw 'The metadata-only Node script is missing'
}
Write-Host 'Omnira - Databento GRATIS metadata/kontraktskontroll' -ForegroundColor Cyan
Write-Host 'Kontrollerar NQZ6 och ESZ6 pa 2026-10-15, endast symbology.resolve och metadata.get_cost.'
Write-Host 'Ingen datanedladdning, prenumeration eller handel.'
Write-Host 'API-nyckeln visas inte och sparas inte pa disk.'
$secret = Read-Host 'Klistra in Databento API-nyckel (osynlig inmatning)' -AsSecureString
$bstr = [IntPtr]::Zero
try {
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $env:DATABENTO_API_KEY = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
    & node $engine --metadata-only
    if ($LASTEXITCODE -ne 0) {
        Write-Host 'Metadata-kontroll stoppad. Ingen betald forfragan gjord.' -ForegroundColor Yellow
        exit $LASTEXITCODE
    }
    Write-Host 'En offert har visats. Ingen data har bestallts eller laddats ned.' -ForegroundColor Green
} finally {
    Remove-Item Env:DATABENTO_API_KEY -ErrorAction SilentlyContinue
    if ($bstr -ne [IntPtr]::Zero) {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    if ($secret) { $secret.Dispose() }
}
