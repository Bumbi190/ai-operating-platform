#Requires -Version 5.1
<#
Pure rights classifier for the DISABLED creative worker.
Never reads or changes machine ACLs; use with ACL entries already verified
as Allow entries belonging to the exact provisioned worker SID.
#>
function Test-CreativeWorkerRights {
  [CmdletBinding()]
  param(
    [Security.AccessControl.FileSystemRights[]]$GrantedRights,
    [bool]$NeedsModify
  )
  if ($null -eq $GrantedRights -or @($GrantedRights).Count -eq 0) { return $false }
  $rightsType = [Security.AccessControl.FileSystemRights]
  # Neither RX nor M may control ownership, ACLs or delete unrelated children.
  $forbiddenControl = $rightsType::ChangePermissions -bor $rightsType::TakeOwnership -bor $rightsType::DeleteSubdirectoriesAndFiles
  # RX folders must not accept WriteData/AppendData/WriteAttributes through a
  # "Write only" ACE, even though it does NOT contain the entire Modify flag.
  # Use atomic flags: composite Write/Modify also contain READ rights, and
  # testing their overlap would incorrectly reject a valid RX permission.
  $forbiddenWrite = $rightsType::WriteData -bor $rightsType::AppendData -bor
    $rightsType::WriteExtendedAttributes -bor $rightsType::WriteAttributes -bor $rightsType::Delete
  $hasModify = $false
  foreach ($rights in $GrantedRights) {
    if (($rights -band $forbiddenControl) -ne 0) { return $false }
    if (-not $NeedsModify -and ($rights -band $forbiddenWrite) -ne 0) { return $false }
    if (($rights -band $rightsType::Modify) -eq $rightsType::Modify) { $hasModify = $true }
  }
  return ($NeedsModify -eq $hasModify)
}
