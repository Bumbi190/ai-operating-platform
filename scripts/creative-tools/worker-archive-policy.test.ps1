#Requires -Version 5.1
# Synthetic metadata-only ZIP adversarial tests. No files extracted or written.
Set-StrictMode -Version Latest
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'worker-archive-policy.ps1')
$leaf=@('LICENSE-APACHE','LICENSE-MIT','OFL-biz-ud-mincho.txt','OFL-biz-ud-pgothic.txt',
  'OFL-shippori-mincho.txt','photocraft-cli.exe','photocraft.exe','portable.txt','README.md')
$prefix='photocraft-0.10.0-windows-x64-portable/'
function New-GoodEntries {
  return @($leaf | ForEach-Object {
    [pscustomobject]@{FullName=($prefix+$_);Length=100L;CompressedLength=50L;ExternalAttributes=0L}
  })
}
function Expect([string]$Label,[object[]]$Entries,[bool]$Safe) {
  $observed=[bool](Test-CreativeZipEntries -Entries $Entries -Program photocraft -Version '0.10.0')
  if ($observed -ne $Safe) {throw "ZIP policy FAIL $Label expected=$Safe observed=$observed"}
}
$count=0
Expect 'original expected nine entries' (New-GoodEntries) $true;$count++
foreach ($mut in @(
  @{name='path traversal';path='../escape.exe'},
  @{name='nested traversal';path=($prefix+'../outside.dll')},
  @{name='absolute path';path='C:/Windows/system32/evil.dll'},
  @{name='backslash';path=($prefix+'subdir\payload.exe')},
  @{name='ADS';path=($prefix+'photocraft.exe:evil')},
  @{name='extra executable';path=($prefix+'run.exe')},
  @{name='duplicate case alias';path=($prefix+'license-apache')},
  @{name='duplicate file name';path=($prefix+'LICENSE-APACHE')}
)){
  $e=New-GoodEntries;$e[1].FullName=$mut.path
  Expect $mut.name $e $false;$count++
}
$e=New-GoodEntries;$e[0].ExternalAttributes=1;Expect 'reparse metadata' $e $false;$count++
$e=New-GoodEntries;$e[0].Length=0L;Expect 'empty entry' $e $false;$count++
$e=New-GoodEntries;$e[0].CompressedLength=0L;Expect 'zero compression' $e $false;$count++
$e=New-GoodEntries;$e[0].Length=129MB;Expect 'oversized entry' $e $false;$count++
$e=New-GoodEntries;$e[0].Length=4000L;Expect 'compression ratio bomb' $e $false;$count++
$e=New-GoodEntries;foreach($item in $e){$item.Length=30MB;$item.CompressedLength=15MB};Expect 'total volume bomb' $e $false;$count++
$e=New-GoodEntries;Expect 'missing entry' @($e|Select-Object -First 8) $false;$count++
$e=New-GoodEntries;Expect 'extra entry' @($e+[pscustomobject]@{FullName=($prefix+'bad.txt');Length=100L;CompressedLength=50L;ExternalAttributes=0L}) $false;$count++
[pscustomobject]@{mode='synthetic-zip-policy-test';cases=$count;allPassed=$true;changesApplied=$false} | ConvertTo-Json
