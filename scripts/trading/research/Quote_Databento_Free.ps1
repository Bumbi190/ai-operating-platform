# Omnira — FREE Databento historical METADATA quote ONLY.
# Never persists API keys, raw HTTP responses, data or credential-bearing logs.
# Only sanitized quote/contract metadata is written on disk.
$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$engine = Join-Path $here 'databento-free-metadata-only.mjs'
$report = Join-Path $here 'Quote_Result_Public.json'
if (-not (Test-Path -LiteralPath $engine)) {
    throw 'The metadata-only Node script is missing'
}
Write-Host 'Omnira - Databento GRATIS metadata/kontraktskontroll' -ForegroundColor Cyan
Write-Host 'Kontrollerar NQZ6 och ESZ6 pa 2026-10-15, endast symbology.resolve och metadata.get_cost.'
Write-Host 'Ingen datanedladdning, prenumeration eller handel.'
Write-Host 'API-nyckeln visas inte, sparas inte och ska inte delas i chatten.'
Write-Host 'Rapporten sparar ENBART symboler, kontrakts-ID, kostnader eller en felkod.'
$secret = Read-Host 'Klistra in Databento API-nyckel (osynlig inmatning)' -AsSecureString
$bstr = [IntPtr]::Zero
$public = [ordered]@{
    observedAt = (Get-Date).ToUniversalTime().ToString('o')
    kind = 'DATABENTO_HISTORICAL_FREE_METADATA_QUOTE'
    status = 'BLOCKED'
    reason = 'UNINITIALIZED'
    downloadedRecords = 0
    billableEndpointsCalled = 0
    downloadAuthorized = $false
}
try {
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
    $env:DATABENTO_API_KEY = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)

    # Metadata response is parsed in memory and reduced to an explicit allowlist.
    # Node never receives a command-line credential; it receives transient env only.
    $rawOutput = (& node $engine --metadata-only 2>$null | Out-String)
    $exitCode = $LASTEXITCODE
    try {
        $response = $rawOutput | ConvertFrom-Json -ErrorAction Stop
        if (($exitCode -eq 0) -and
            ($response.status -eq 'FREE_METADATA_ONLY_COMPLETE') -and
            ($response.downloadedRecords -eq 0) -and
            ($response.billableEndpointsCalled -eq 0) -and
            ($response.downloadAuthorized -eq $false) -and
            ($response.instruments.Count -eq 2) -and
            ($response.quotes.Count -eq 2) -and
            ($null -ne $response.combinedEstimatedUSD)) {
            $public.status = 'FREE_METADATA_ONLY_COMPLETE'
            $public.reason = $null
            $public.dataset = 'GLBX.MDP3'
            $public.schema = 'ohlcv-1m'
            $public.start = '2026-10-15T00:00:00Z'
            $public.end = '2026-10-16T00:00:00Z'
            $public.instruments = @($response.instruments | ForEach-Object {
                [ordered]@{
                    root = [string]$_.root
                    rawSymbol = [string]$_.rawSymbol
                    instrumentId = [string]$_.instrumentId
                    mappingStart = [string]$_.mappingStart
                    mappingEnd = [string]$_.mappingEnd
                }
            })
            $public.quotes = @($response.quotes | ForEach-Object {
                [ordered]@{
                    root = [string]$_.root
                    rawSymbol = [string]$_.rawSymbol
                    estimateUSD = [decimal]$_.estimateUSD
                }
            })
            $public.combinedEstimatedUSD = [decimal]$response.combinedEstimatedUSD
            $public.estimateOnly = $true
        } else {
            $code = [string]$response.reason
            if ($code -match '^[A-Z0-9_]{4,120}$') {
                $public.reason = $code
            } else {
                $public.reason = 'NO_VERIFIABLE_QUOTE'
            }
        }
    } catch {
        $public.reason = 'QUOTE_RESULT_NOT_PARSEABLE'
    }
} finally {
    Remove-Item Env:DATABENTO_API_KEY -ErrorAction SilentlyContinue
    if ($bstr -ne [IntPtr]::Zero) {
        [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
    }
    if ($secret) { $secret.Dispose() }
}
# Write ONLY the allowlisted public record. Never write $rawOutput or the key.
$public | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $report -Encoding UTF8
Write-Host ('Rapport sparad: ' + $report)
if ($public.status -eq 'FREE_METADATA_ONLY_COMPLETE') {
    Write-Host ('NQ + ES - beraknad summa: $' + $public.combinedEstimatedUSD + ' USD') -ForegroundColor Green
    Write-Host 'Ingen data har bestallts. Krediterna har inte använts av detta verktyg.'
} else {
    Write-Host ('Offert ej bekraftad: ' + $public.reason) -ForegroundColor Yellow
    Write-Host 'Inga betalda dataforfragningar gjordes.'
}
