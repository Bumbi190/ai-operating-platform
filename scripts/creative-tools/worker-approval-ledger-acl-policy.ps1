#Requires -Version 5.1
# Pure Windows NTFS acceptance policy for a PROPOSED, separate admin-owned
# Creative approval ledger. No filesystem writes; synthetic-testable.
function Test-CreativeApprovalLedgerAcl {
  [CmdletBinding()]
  param(
    [string]$OwnerSid,
    [bool]$InheritanceProtected,
    [bool]$IsDirectory,
    [bool]$ExpectedDirectory,
    [bool]$IsReparse,
    [object[]]$Rules
  )
  $trusted=@('S-1-5-18','S-1-5-32-544')
  if($OwnerSid -notin $trusted -or -not $InheritanceProtected -or
      $IsDirectory -ne $ExpectedDirectory -or $IsReparse -or $null -eq $Rules -or
      @($Rules).Count -lt 2) { return $false }
  $found=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
  $rightsType=[Security.AccessControl.FileSystemRights]
  foreach($rule in $Rules){
    if($null -eq $rule -or
        [string]$rule.Sid -notin $trusted -or
        [string]$rule.AccessType -ne 'Allow' -or
        $rule.Inherited -ne $false) { return $false }
    # SYSTEM + administrators can administer this directory. The worker,
    # ordinary user, Authenticated Users and Everyone must have NO ACE.
    $rights=[long]$rule.Rights
    if(($rights -band [long]$rightsType::FullControl) -ne [long]$rightsType::FullControl){
      return $false
    }
    [void]$found.Add([string]$rule.Sid)
  }
  return ($found.Contains('S-1-5-18') -and $found.Contains('S-1-5-32-544'))
}
