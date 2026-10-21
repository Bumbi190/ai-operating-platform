#Requires -Version 5.1
# Synthetic fixture only. Reproduce from ordinary PowerShell, never elevate worktree code.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'STOP: use ordinary PowerShell; do not import worktree code elevated.'}
$systemHome='C:\Windows\System32\WindowsPowerShell\v1.0'
$env:PSModulePath=$systemHome+'\Modules'
$PSModuleAutoLoadingPreference='None'
$m=Microsoft.PowerShell.Core\Import-Module -Name ($systemHome+'\Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1') -Force -PassThru -ErrorAction Stop
if($m.Name -ne 'Microsoft.PowerShell.Utility' -or -not $m.Path.StartsWith($systemHome+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Untrusted system module'}
$sourcePath=[IO.Path]::GetFullPath($PSScriptRoot+'\..\..\docs\ATLAS_CREATIVE_P32_HANDLE_FILE_PROBE.txt')
Microsoft.PowerShell.Utility\Add-Type -TypeDefinition ([IO.File]::ReadAllText($sourcePath)) -ErrorAction Stop
$result=[CreativeHandleFileProbe]::Run()
$result | Microsoft.PowerShell.Utility\ConvertTo-Json -Depth 5
if($result.Error){exit 2}
