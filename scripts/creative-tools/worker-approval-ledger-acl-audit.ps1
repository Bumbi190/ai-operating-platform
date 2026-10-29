#Requires -Version 5.1
<#
Read-only NTFS preflight for PROPOSED approval ledger:
 C:\ProgramData\OmniraCreativeWorker\approvals\nonces
Does NOT create directories, change ACLs, enable accounts or read approval
secrets. A green ACL audit is not human approval or proof of process isolation.
#>
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'worker-approval-ledger-acl-policy.ps1')
$root=Join-Path $env:ProgramData 'OmniraCreativeWorker'
$approvals=Join-Path $root 'approvals'
$nonces=Join-Path $approvals 'nonces'
$trusted=@('S-1-5-18','S-1-5-32-544')
$rootTrusted=$false
try {
 $item=Get-Item -LiteralPath $root -Force -ErrorAction Stop
 $acl=Get-Acl -LiteralPath $root -ErrorAction Stop
 $owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
 $rootTrusted=$item.PSIsContainer -and
   -not ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -and
   $acl.AreAccessRulesProtected -and ($owner -in $trusted)
 if($rootTrusted){
  $rightsType=[Security.AccessControl.FileSystemRights]
  $writeMask=$rightsType::WriteData -bor $rightsType::AppendData -bor
    $rightsType::WriteExtendedAttributes -bor $rightsType::WriteAttributes -bor
    $rightsType::ChangePermissions -bor $rightsType::TakeOwnership -bor
    $rightsType::Delete -bor $rightsType::DeleteSubdirectoriesAndFiles
  $rootRules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
  $unsafe=@($rootRules|Where-Object {
   $_.AccessControlType -eq 'Allow' -and
   $_.IdentityReference.Value -notin $trusted -and
   (([long]$_.FileSystemRights -band [long]$writeMask) -ne 0)
  })
  if($unsafe.Count -gt 0){$rootTrusted=$false}
 }
} catch { $rootTrusted=$false }
function Inspect-ProposedApprovalItem([string]$Path,[bool]$ExpectedDirectory){
 try {
  $item=Get-Item -LiteralPath $Path -Force -ErrorAction Stop
  $acl=Get-Acl -LiteralPath $Path -ErrorAction Stop
  $owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
  $rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])|ForEach-Object{
   [pscustomobject]@{
     Sid=$_.IdentityReference.Value
     AccessType=$_.AccessControlType.ToString()
     Inherited=[bool]$_.IsInherited
     Rights=[long]$_.FileSystemRights
   }
  })
  $ok=[bool](Test-CreativeApprovalLedgerAcl -OwnerSid $owner -InheritanceProtected $acl.AreAccessRulesProtected -IsDirectory ([bool]$item.PSIsContainer) -ExpectedDirectory $ExpectedDirectory -IsReparse ([bool]($item.Attributes -band [IO.FileAttributes]::ReparsePoint)) -Rules $rules)
  return [pscustomobject]@{verified=$ok;reason=$(if($ok){'verified'}else{'wrong_owner_or_acl_or_type'})}
 } catch {
  return [pscustomobject]@{verified=$false;reason='inaccessible_or_missing'}
 }
}
$approvalCheck=Inspect-ProposedApprovalItem $approvals $true
$nonceCheck=Inspect-ProposedApprovalItem $nonces $true
$allowlistVerified=$false
$recordCount=0
$recordsVerified=$false
if($rootTrusted -and $approvalCheck.verified -and $nonceCheck.verified){
 try {
  $approvalChildren=@(Get-ChildItem -LiteralPath $approvals -Force -ErrorAction Stop)
  if($approvalChildren.Count -ne 1 -or
     $approvalChildren[0].Name -cne 'nonces' -or
     -not $approvalChildren[0].PSIsContainer){throw 'unexpected_approvals_entry'}
  $records=@(Get-ChildItem -LiteralPath $nonces -Force -ErrorAction Stop)
  if($records.Count -gt 32){throw 'too_many_approval_receipts'}
  $allowlistVerified=$true
  foreach($entry in $records){
   if($entry.Name -cnotmatch '^[a-f0-9]{64}\.json$' -or $entry.PSIsContainer -or
      ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint)){
    throw 'unexpected_nonce_receipt_entry'
   }
   $checked=Inspect-ProposedApprovalItem $entry.FullName $false
   if(-not $checked.verified){throw 'nonce_receipt_acl_unverified'}
   $recordCount++
  }
  $recordsVerified=$true
 } catch {
  $allowlistVerified=$false
  $recordsVerified=$false
  $recordCount=0
 }
}
$aclVerified=[bool]($rootTrusted -and $approvalCheck.verified -and
 $nonceCheck.verified -and $allowlistVerified -and $recordsVerified)
[pscustomobject]@{
 mode='read-only-proposed-creative-approval-ledger-ntfs-audit'
 expectedDirectories=2;rootTrusted=[bool]$rootTrusted
 approvalsFolder=$approvalCheck;nonceFolder=$nonceCheck
 exactAllowlistedTreeVerified=[bool]$allowlistVerified
 receiptsAclVerified=[bool]$recordsVerified
 receiptCount=$recordCount;aclVerified=$aclVerified
 expectedPrivatePrincipals=@('SYSTEM','BUILTIN\Administrators')
 workerAccessAuthorized=$false;effectiveTokenIsolationVerified=$false
 receiptContentsVerified=$false;externalAnchorVerified=$false
 realReviewerIdentityVerified=$false;installationAuthorized=$false
 changesApplied=$false;workerExecutionEnabled=$false;productionReady=$false
} | ConvertTo-Json -Depth 5
