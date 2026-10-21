#Requires -Version 5.1
# Synthetic Windows rights tests. Never touches real filesystem ACLs.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'worker-acl-policy.ps1')
$r=[Security.AccessControl.FileSystemRights]
$tests=@(
  @{name='RX accepted in input';rights=@($r::ReadAndExecute);modify=$false;expected=$true}
  @{name='M accepted in output';rights=@($r::Modify);modify=$true;expected=$true}
  @{name='RX insufficient in output';rights=@($r::ReadAndExecute);modify=$true;expected=$false}
  @{name='M forbidden in input';rights=@($r::Modify);modify=$false;expected=$false}
  @{name='Write-only forbidden in input';rights=@($r::Write);modify=$false;expected=$false}
  @{name='Write-only insufficient in output';rights=@($r::Write);modify=$true;expected=$false}
  @{name='Append-only forbidden in input';rights=@($r::AppendData);modify=$false;expected=$false}
  @{name='WriteAttributes forbidden in input';rights=@($r::WriteAttributes);modify=$false;expected=$false}
  @{name='ChangePermissions forbidden in output';rights=@(($r::Modify -bor $r::ChangePermissions));modify=$true;expected=$false}
  @{name='TakeOwnership forbidden in output';rights=@(($r::Modify -bor $r::TakeOwnership));modify=$true;expected=$false}
  @{name='DeleteChildren forbidden in output';rights=@(($r::Modify -bor $r::DeleteSubdirectoriesAndFiles));modify=$true;expected=$false}
  @{name='FullControl forbidden in output';rights=@($r::FullControl);modify=$true;expected=$false}
  @{name='Mixed RX Write rejected';rights=@($r::ReadAndExecute,$r::Write);modify=$false;expected=$false}
  @{name='Empty ACL rejected';rights=@();modify=$false;expected=$false}
)
foreach($test in $tests){
  $actual=[bool](Test-CreativeWorkerRights -GrantedRights $test.rights -NeedsModify $test.modify)
  if($actual -ne $test.expected){throw "Worker ACL policy FAIL: $($test.name) expected=$($test.expected) actual=$actual"}
}
[pscustomobject]@{mode='synthetic-acl-policy-test';cases=$tests.Count;allPassed=$true;changesApplied=$false} | ConvertTo-Json
