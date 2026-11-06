#Requires -Version 5.1
<#
.SYNOPSIS
Read-only NTFS review of a FUTURE protected Creative Tools handoff tree.
No account, folder, owner, ACL, firewall or execution changes.
Not an approval; must be combined with independent reviewer-pinned digest,
post-copy byte verification and a separately authorized copy ceremony.
#>
[CmdletBinding()]
param()
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
$root=Join-Path $env:ProgramData 'OmniraCreativeWorker'
$trustedSids=@('S-1-5-18','S-1-5-32-544')
$control=@('artcraft-lock.json','worker-acl-policy.ps1','worker-archive-audit.ps1',
 'worker-archive-policy.ps1','worker-stage-binaries.ps1','worker-verify.ps1')
$checks=@()
$rootVerified=$false
try {
  $rootItem=Get-Item -LiteralPath $root -Force -ErrorAction Stop
  $rootAcl=Get-Acl -LiteralPath $root -ErrorAction Stop
  $rootOwner=$rootAcl.GetOwner([Security.Principal.SecurityIdentifier]).Value
  $rootVerified=($rootItem.PSIsContainer -and
    -not ($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -and
    $rootAcl.AreAccessRulesProtected -and $rootOwner -in $trustedSids)
} catch { $rootVerified=$false }
$expectedFiles=@()
$expectedDirs=@('control','imports')
foreach($name in $control){$expectedFiles+=('control/'+$name)}
foreach($app in @('photocraft','filmcraft')){
  $version=if($app -eq 'photocraft'){'0.10.0'}else{'0.9.0'}
  $release="$app-$version-windows-x64-portable"
  $expectedDirs+=@("imports/$app","imports/$app/portable","imports/$app/portable/$release")
  $expectedFiles+=@("imports/$app/$release.zip",
   "imports/$app/portable/$release/$app-cli.exe",
   "imports/$app/portable/$release/$app.exe")
}
function Inspect-ProtectedPath([string]$relative,[bool]$directory){
  $path=Join-Path $root ($relative -replace '/', '\')
  $reason='unknown'
  try{
    $item=Get-Item -LiteralPath $path -Force -ErrorAction Stop
    if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'reparse_point'}
    if([bool]$item.PSIsContainer -ne $directory){throw 'type_mismatch'}
    $acl=Get-Acl -LiteralPath $path -ErrorAction Stop
    if(-not $acl.AreAccessRulesProtected){throw 'acl_inheritance_enabled'}
    $owner=$acl.GetOwner([Security.Principal.SecurityIdentifier]).Value
    if($owner -notin $trustedSids){throw 'untrusted_owner'}
    $rules=@($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
    if($rules.Count -eq 0){throw 'missing_acls'}
    $allowed=@($rules|Where-Object{$_.AccessControlType -eq 'Allow'})
    if($allowed.Count -eq 0){throw 'no_allow_acls'}
    if(@($rules|Where-Object{$_.AccessControlType -ne 'Allow' -or
       $_.IdentityReference.Value -notin $trustedSids}).Count -gt 0){throw 'untrusted_ace'}
    return [pscustomobject]@{relative=$relative;verified=$true;reason='verified'}
  }catch{
    $detail=$_.Exception.Message
    $reason=if($detail -in @('reparse_point','type_mismatch','acl_inheritance_enabled',
       'untrusted_owner','missing_acls','no_allow_acls','untrusted_ace')){$detail}else{'inaccessible_or_missing'}
    return [pscustomobject]@{relative=$relative;verified=$false;reason=$reason}
  }
}
# No traversal into an unreviewed tree on a non-elevated account. All paths
# come from a fixed allowlist, never from an untrusted handoff manifest.
foreach($path in $expectedDirs){$checks+=Inspect-ProtectedPath $path $true}
foreach($path in $expectedFiles){$checks+=Inspect-ProtectedPath $path $false}
$exactTree=$false
if($rootVerified -and @($checks|Where-Object{-not $_.verified}).Count -eq 0){
  try{
    $observedDirs=@()
    $observedFiles=@()
    foreach($scope in @('control','imports')){
      $scopeRoot=Join-Path $root $scope
      $all=@(Get-ChildItem -LiteralPath $scopeRoot -Recurse -Force -ErrorAction Stop)
      foreach($entry in $all){
        $relative=($entry.FullName.Substring($root.Length).TrimStart('\') -replace '\\','/')
        if($entry.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'untrusted_tree_link'}
        if($entry.PSIsContainer){$observedDirs+=$relative}else{$observedFiles+=$relative}
      }
    }
    $dirsExpected=@($expectedDirs|Where-Object{$_ -notin @('control','imports')})
    $exactTree=(($observedDirs.Count -eq $dirsExpected.Count) -and
      ($observedFiles.Count -eq $expectedFiles.Count) -and
      (@($observedDirs|Where-Object{$_ -cnotin $dirsExpected}).Count -eq 0) -and
      (@($observedFiles|Where-Object{$_ -cnotin $expectedFiles}).Count -eq 0))
  }catch{$exactTree=$false}
}
[pscustomobject]@{
 mode='read-only-protected-handoff-acl-audit';scope='control-and-imports'
 expectedFiles=$expectedFiles.Count;expectedDirectories=$expectedDirs.Count
 protectedRootVerified=[bool]$rootVerified
 checks=$checks;exactAllowlistedTreeVerified=[bool]$exactTree
 aclVerified=($rootVerified -and @($checks|Where-Object{-not $_.verified}).Count -eq 0 -and $exactTree)
 sourceHandoffApproved=$false;postCopyDigestsVerified=$false
 changesApplied=$false;workerExecutionEnabled=$false;productionReady=$false
} | ConvertTo-Json -Depth 6
