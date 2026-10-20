#Requires -Version 5.1
<#
Read-only audit of the proposed Windows media-worker account and NTFS boundary.
Returns false, not "ready", for missing controls; never changes machine settings.
#>
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$name = 'omnira-media-worker'
$root = Join-Path $env:ProgramData 'OmniraCreativeWorker'
$folders = @('bin','queue','input','output','temp','receipts')
$account = Get-LocalUser -Name $name -ErrorAction SilentlyContinue
$accountExists = $null -ne $account
$accountDisabled = $accountExists -and (-not $account.Enabled)
$nonAdmin = $false
$groupCheckAvailable = $false
if ($accountExists) {
  try {
    $admins = @(Get-LocalGroupMember -SID 'S-1-5-32-544' -ErrorAction Stop)
    $nonAdmin = @($admins | Where-Object { $_.SID.Value -eq $account.SID.Value }).Count -eq 0
    $groupCheckAvailable = $true
  } catch {
    $nonAdmin = $false
  }
}
$folderChecks = @()
foreach ($folder in @('') + $folders) {
  $path = if ($folder -eq '') { $root } else { Join-Path $root $folder }
  $present = Test-Path -LiteralPath $path -PathType Container
  $inheritanceDisabled = $false
  $workerRightsOk = $false
  $unexpectedAllow = $true
  if ($present -and $accountExists) {
    try {
      $acl = Get-Acl -LiteralPath $path
      $inheritanceDisabled = $acl.AreAccessRulesProtected
      $sidRules = @($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
      $accepted = @('S-1-5-18','S-1-5-32-544',$account.SID.Value)
      $unexpectedAllow = @($sidRules | Where-Object {
        $_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Value -notin $accepted
      }).Count -gt 0
      $workerRules = @($sidRules | Where-Object {
        $_.AccessControlType -eq 'Allow' -and $_.IdentityReference.Value -eq $account.SID.Value
      })
      $hasRules = $workerRules.Count -gt 0
      $needsModify = $folder -in @('output','temp')
      $hasModify = @($workerRules | Where-Object {
        (($_.FileSystemRights -band [Security.AccessControl.FileSystemRights]::Modify) -eq [Security.AccessControl.FileSystemRights]::Modify)
      }).Count -gt 0
      $workerRightsOk = $hasRules -and (($needsModify -and $hasModify) -or (-not $needsModify -and -not $hasModify))
    } catch {
      $inheritanceDisabled = $false
      $workerRightsOk = $false
      $unexpectedAllow = $true
    }
  }
  $folderChecks += [pscustomobject]@{
    folder = if ($folder -eq '') {'root'} else {$folder}
    exists = [bool]$present
    inheritanceDisabled = [bool]$inheritanceDisabled
    workerRightsOk = [bool]$workerRightsOk
    noUnexpectedAllow = (-not $unexpectedAllow)
  }
}
$aclVerified = $accountExists -and @($folderChecks | Where-Object {
  -not ($_.exists -and $_.inheritanceDisabled -and $_.workerRightsOk -and $_.noUnexpectedAllow)
}).Count -eq 0
[pscustomobject]@{
  mode = 'read-only-verification'
  account = $name
  accountExists = [bool]$accountExists
  accountDisabled = [bool]$accountDisabled
  groupCheckAvailable = [bool]$groupCheckAvailable
  accountNotAdministrator = [bool]$nonAdmin
  root = $root
  folderChecks = $folderChecks
  restrictedAclsVerified = [bool]$aclVerified
  networkEgressVerified = $false
  signedQueueConfigured = $false
  workerExecutionEnabled = $false
  productionReady = $false
} | ConvertTo-Json -Depth 6
