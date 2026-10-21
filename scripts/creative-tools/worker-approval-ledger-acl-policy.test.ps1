#Requires -Version 5.1
# Pure synthetic Windows ACL tests; no NTFS/account modifications.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'worker-approval-ledger-acl-policy.ps1')
$r=[Security.AccessControl.FileSystemRights]
function New-Rules {
 return @(
  [pscustomobject]@{Sid='S-1-5-18';AccessType='Allow';Inherited=$false;Rights=[long]$r::FullControl},
  [pscustomobject]@{Sid='S-1-5-32-544';AccessType='Allow';Inherited=$false;Rights=[long]$r::FullControl}
 )
}
function Check([string]$name,[string]$owner,[bool]$inheritance,
  [bool]$isDirectory,[bool]$expectedDirectory,[bool]$reparse,[object[]]$rules,[bool]$expected){
 $actual=[bool](Test-CreativeApprovalLedgerAcl -OwnerSid $owner -InheritanceProtected $inheritance -IsDirectory $isDirectory -ExpectedDirectory $expectedDirectory -IsReparse $reparse -Rules $rules)
 if($actual -ne $expected){throw "ACL scenario FAILED: $name got $actual, expected $expected"}
}
$sys='S-1-5-18';$admin='S-1-5-32-544'
$count=0
Check 'admin root success' $admin $true $true $true $false (New-Rules) $true;$count++
Check 'system-owned receipt success' $sys $true $false $false $false (New-Rules) $true;$count++
Check 'user-owned fails' 'S-1-5-21-123-456-789-1001' $true $true $true $false (New-Rules) $false;$count++
Check 'inheritance enabled fails' $admin $false $true $true $false (New-Rules) $false;$count++
Check 'reparse dir fails' $admin $true $true $true $true (New-Rules) $false;$count++
Check 'file replacing ledger folder fails' $admin $true $false $true $false (New-Rules) $false;$count++
Check 'directory replacing receipt fails' $admin $true $true $false $false (New-Rules) $false;$count++
foreach($sid in @('S-1-1-0','S-1-5-11','S-1-5-32-545','S-1-5-21-123-456-789-1001')){
 $rules=@(New-Rules)+@([pscustomobject]@{Sid=$sid;AccessType='Allow';Inherited=$false;Rights=[long]$r::ReadAndExecute})
 Check ("extra read "+$sid) $admin $true $true $true $false $rules $false;$count++
}
$rules=@(New-Rules)+@([pscustomobject]@{Sid='S-1-5-11';AccessType='Deny';Inherited=$false;Rights=[long]$r::ReadAndExecute})
Check 'untrusted deny fails closed' $admin $true $true $true $false $rules $false;$count++
$rules=New-Rules;$rules[1].Inherited=$true
Check 'inherited admin allow rejected' $admin $true $true $true $false $rules $false;$count++
$rules=New-Rules;$rules[1].Rights=[long]$r::ReadAndExecute
Check 'administrator not fully privileged' $admin $true $true $true $false $rules $false;$count++
$rules=New-Rules;$rules[0].Rights=[long]$r::Modify
Check 'SYSTEM not fully privileged' $admin $true $true $true $false $rules $false;$count++
$rules=@(New-Rules|Select-Object -First 1)
Check 'missing admin ACE' $admin $true $true $true $false $rules $false;$count++
$rules=@(New-Rules|Select-Object -Last 1)
Check 'missing SYSTEM ACE' $admin $true $true $true $false $rules $false;$count++
[pscustomobject]@{mode='synthetic-approval-ledger-acl-policy';cases=$count;allPassed=$true;changesApplied=$false;productionReady=$false} | ConvertTo-Json
