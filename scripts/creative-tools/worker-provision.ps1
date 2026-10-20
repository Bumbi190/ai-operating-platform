#Requires -Version 5.1
<#
.SYNOPSIS
Plan or create a DISABLED, limited local account for Omnira media testing.
.DESCRIPTION
Default is read-only Plan. Apply MUST run in an elevated PowerShell window.
It NEVER enables the account, starts a service, alters the main Omnira repo,
or opens network access. No passwords are saved.
#>
[CmdletBinding()]
param([switch]$Apply)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$WorkerName = 'omnira-media-worker'
$Root = Join-Path $env:ProgramData 'OmniraCreativeWorker'
$Dirs = @('bin','queue','input','output','temp','receipts')
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$isAdmin = ([Security.Principal.WindowsPrincipal]$identity).IsInRole(
  [Security.Principal.WindowsBuiltInRole]::Administrator
)
$existing = Get-LocalUser -Name $WorkerName -ErrorAction SilentlyContinue
$folders = @{}
foreach ($folder in $Dirs) {
  $folders[$folder] = Join-Path $Root $folder
}
if (-not $Apply) {
  [pscustomobject]@{
    mode = 'plan-only'
    changesApplied = $false
    machine = $env:COMPUTERNAME
    elevated = $isAdmin
    account = $WorkerName
    existingAccount = ($null -ne $existing)
    existingAccountEnabled = $(if ($null -eq $existing) { $null } else { $existing.Enabled })
    intendedAccountState = 'disabled; non-admin'
    root = $Root
    folders = $folders
    needsOperatorElevation = (-not $isAdmin)
    networkEgressVerified = $false
    editorBinaryAccessVerified = $false
    authenticatedJobQueueReady = $false
    productionReady = $false
  } | ConvertTo-Json -Depth 6
  return
}
if (-not $isAdmin) {
  throw 'Admin elevation required. Refusing account and ACL changes.'
}
if ($null -ne $existing) {
  throw 'Account already exists: refusing to replace or change an existing account.'
}
if (Test-Path -LiteralPath $Root) {
  throw 'Target already exists: refusing to change any existing ACLs.'
}
$secure = Read-Host "Set a NEW strong local password for $WorkerName (never logged)" -AsSecureString
if ($null -eq $secure -or $secure.Length -eq 0) {
  throw 'No password supplied; nothing changed.'
}
Write-Warning 'Creating a DISABLED local test account and isolated empty folders. Does not enable execution.'
$params = @{
  Name = $WorkerName
  Password = $secure
  Disabled = $true
  Description = 'Omnira Creative: isolated media pilot identity, disabled until validated'
  UserMayNotChangePassword = $true
}
$created = New-LocalUser @params
if ($created.Enabled) { Disable-LocalUser -Name $WorkerName }
# Never grant membership in Administrators or Remote Desktop Users.
$principalSid = $created.SID.Value
New-Item -ItemType Directory -Path $Root -ErrorAction Stop | Out-Null
foreach ($folder in $Dirs) {
  New-Item -ItemType Directory -Path $folders[$folder] -ErrorAction Stop | Out-Null
}
function Set-ExactAcl([string]$Path, [string]$WorkerRights) {
  & icacls.exe $Path /inheritance:r | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Cannot disable inherited ACL at $Path" }
  $aces = @(
    '*S-1-5-18:(OI)(CI)F',
    '*S-1-5-32-544:(OI)(CI)F',
    ('*'+$principalSid+':(OI)(CI)'+$WorkerRights)
  )
  & icacls.exe $Path /grant:r @aces | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Cannot assign exact ACL at $Path" }
}
Set-ExactAcl $Root 'RX'
foreach ($folder in $Dirs) {
  $rights = if ($folder -in @('output','temp')) { 'M' } else { 'RX' }
  Set-ExactAcl $folders[$folder] $rights
}
$created = Get-LocalUser -Name $WorkerName
if ($created.Enabled) { throw 'Account must remain disabled.' }
$admins = Get-LocalGroupMember -SID 'S-1-5-32-544' -ErrorAction Stop
if ($admins.SID.Value -contains $created.SID.Value) {
  throw 'Unexpected administrator membership. STOP.'
}
[pscustomobject]@{
  mode = 'provisioned-disabled'
  changesApplied = $true
  account = $WorkerName
  accountSid = $principalSid
  enabled = $false
  root = $Root
  networkEgressVerified = $false
  editorBinaryAccessVerified = $false
  authenticatedJobQueueReady = $false
  productionReady = $false
  nextAction = 'Independent ACL, network, signature and isolation review required before enabling worker.'
} | ConvertTo-Json -Depth 4
