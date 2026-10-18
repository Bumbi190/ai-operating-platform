param([Parameter(Mandatory=$true)][ValidateSet('Protect','Unprotect')][string]$Action)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Security
$encoded=[Console]::In.ReadToEnd()
if ($encoded.Length -gt 240000 -or $encoded -notmatch '^[A-Za-z0-9+/]*={0,2}$') { throw 'INVALID_JOURNAL_BYTES' }
$bytes=[Convert]::FromBase64String($encoded)
$entropy=[Text.Encoding]::UTF8.GetBytes('Omnira.Atlas.LocalText.Journal.v1')
$scope=[Security.Cryptography.DataProtectionScope]::CurrentUser
if ($Action -eq 'Protect') { $result=[Security.Cryptography.ProtectedData]::Protect($bytes,$entropy,$scope) }
else { $result=[Security.Cryptography.ProtectedData]::Unprotect($bytes,$entropy,$scope) }
@{bytes=[Convert]::ToBase64String($result)} | ConvertTo-Json -Compress
