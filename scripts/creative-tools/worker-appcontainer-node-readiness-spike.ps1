#Requires -Version 5.1
# Standalone standard-user synthetic Node readiness diagnostic; no worker/editor/project/network operation.
[CmdletBinding()]
param([ValidateSet('ignore','inherit')][string]$StdioMode='ignore',[ValidateSet('installed','profile')][string]$RuntimeLocation='profile')
$ErrorActionPreference='Stop'
Set-StrictMode -Version Latest
$principal=[Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
if($principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'STOP: ordinary nonadmin PowerShell required; no profile created.'}
$systemHome='C:\Windows\System32\WindowsPowerShell\v1.0'
$env:PSModulePath=$systemHome+'\Modules'
$PSModuleAutoLoadingPreference='None'
$m=Microsoft.PowerShell.Core\Import-Module -Name ($systemHome+'\Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1') -Force -PassThru -ErrorAction Stop
if($m.Name -ne 'Microsoft.PowerShell.Utility' -or -not $m.Path.StartsWith($systemHome+'\',[StringComparison]::OrdinalIgnoreCase)){throw 'Untrusted system module'}
$sourcePath=[IO.Path]::GetFullPath($PSScriptRoot+'\..\..\docs\ATLAS_CREATIVE_P34_NODE_READINESS_PROBE.txt')
Microsoft.PowerShell.Utility\Add-Type -TypeDefinition ([IO.File]::ReadAllText($sourcePath)) -ErrorAction Stop
$result=[CreativeNodeReadinessProbe]::Run($StdioMode.ToLowerInvariant(),$RuntimeLocation.ToLowerInvariant())
$result | Microsoft.PowerShell.Utility\ConvertTo-Json -Depth 6
if($result.Error){exit 2}
