$ErrorActionPreference='Stop'
$PSModuleAutoLoadingPreference='None'
Microsoft.PowerShell.Core\Import-Module 'C:\Windows\System32\WindowsPowerShell\v1.0\Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1'
$id=[Security.Principal.WindowsIdentity]::GetCurrent()
try {
 $principal=[Security.Principal.WindowsPrincipal]::new($id)
 if($id.IsSystem -or $id.IsAnonymous -or $id.IsGuest -or $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'ordinary identity required'}
 foreach($group in $id.Groups){if($group.Value.StartsWith('S-1-15-2-',[StringComparison]::Ordinal)){throw 'AppContainer refused'}}
} finally {$id.Dispose()}
$framework='C:\Windows\Microsoft.NET\Framework64\v4.0.30319'
$compiler=[IO.Path]::Combine($framework,'csc.exe')
$runtime='C:\Program Files\nodejs\node.exe'
function HashFile([string]$path) {
 $f=[IO.File]::Open($path,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::Read)
 $h=[Security.Cryptography.SHA256]::Create()
 try{return [BitConverter]::ToString($h.ComputeHash($f)).Replace('-','').ToLowerInvariant()}finally{$h.Dispose();$f.Dispose()}
}
function NewText([string]$path,[string]$value) {
 $f=[IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
 try{$b=[Text.UTF8Encoding]::new($false,$true).GetBytes($value);$f.Write($b,0,$b.Length);$f.Flush($true)}finally{$f.Dispose()}
}
function CsString([string]$s) {
 $b=[Text.StringBuilder]::new();[void]$b.Append('"')
 foreach($c in $s.ToCharArray()){
  if($c -eq '"'){[void]$b.Append('\"')}elseif($c -eq '\'){[void]$b.Append('\\')}
  elseif([int]$c -lt 32 -or [int]$c -gt 126){[void]$b.Append(('\u{0:x4}' -f [int]$c))}
  else{[void]$b.Append($c)}
 };[void]$b.Append('"');return $b.ToString()
}
$compilerHash=HashFile $compiler
$versionInfo=[Diagnostics.FileVersionInfo]::GetVersionInfo($compiler)
$compilerVersion=('{0}.{1}.{2}.{3}' -f $versionInfo.FileMajorPart,$versionInfo.FileMinorPart,$versionInfo.FileBuildPart,$versionInfo.FilePrivatePart)
if($compilerVersion -cnotmatch '^[0-9]+(\.[0-9]+)+$' -or $compilerVersion.Length -gt 64){throw 'unexpected compiler version'}
$runtimeHash=HashFile $runtime
if($runtimeHash -cne '780f44f2c53c108bae261ada21a525b4bfe733c020ac85e41bfe94479090ac9b'){throw 'runtime pin mismatch'}
$parent=[IO.Path]::GetFullPath([IO.Path]::Combine($PSScriptRoot,'..'))
$repo=[IO.Path]::GetFullPath([IO.Path]::Combine($parent,'..\..\..'))
$commit=(& git -C $repo rev-parse HEAD)
if($LASTEXITCODE -ne 0 -or $commit -cnotmatch '^[0-9a-f]{40}$'){throw 'source revision unavailable'}
$parentJson=& ([IO.Path]::Combine($parent,'build.ps1'))
$info=$parentJson | Microsoft.PowerShell.Utility\ConvertFrom-Json
$root=$info.BuildRoot
$shared=@('Contracts.cs','NativeMethods.cs','NativeResources.cs','WindowsProcessBoundary.cs','FixtureInput.cs','SyntheticProtocol.cs','PipeSession.cs','SyntheticRunner.cs','ObservationWriter.cs')
$production=@('PackageContracts.cs','PackageManifest.cs','ReviewProgram.cs')
$tests=@('tests\TestProgram.cs','tests\ManifestTests.cs')
$sourceKeys=@($shared+@('Program.cs','tests\TestProgram.cs','tests\BoundaryTests.cs','tests\InputTests.cs','tests\ProtocolTests.cs','tests\LifecycleTests.cs','tests\CleanupTests.cs','tests\CrashHarness.cs'))
$hostHash=HashFile $info.HostExe
$hostLength=[IO.FileInfo]::new($info.HostExe).Length
if($hostLength -lt 1 -or $hostLength -gt 1048576){throw 'host size'}
$code='namespace Omnira.Creative.Review { internal static class ReleaseBuildContext {'
$code+='internal const string HostSha256='+(CsString $hostHash)+';internal const int HostLength='+$hostLength+';'
$code+='internal const string SourceCommit='+(CsString $commit)+';'
$code+='internal const string CompilerSha256='+(CsString $compilerHash)+';internal const string CompilerVersion='+(CsString $compilerVersion)+';'
$code+='internal const string RuntimeSha256='+(CsString $runtimeHash)+';'
$code+='internal static System.Collections.Generic.IDictionary<string,string> SourceDigests { get { var d=new System.Collections.Generic.Dictionary<string,string>(System.StringComparer.Ordinal);'
foreach($key in $sourceKeys){
 $actual=HashFile ([IO.Path]::Combine($parent,$key))
 if($actual -cne $info.SourceDigests.$key){throw 'parent source observation drift'}
 $code+='d.Add('+(CsString $key)+','+(CsString $actual)+');'
}
$code+='return d; } } } }'
$context=[IO.Path]::Combine($root,'ReleaseBuildContext.cs');NewText $context $code
$common=@('/nologo','/noconfig','/nostdlib+','/platform:x64','/target:exe','/optimize+')
foreach($ref in @('mscorlib.dll','System.dll','System.Core.dll','System.Runtime.Serialization.dll')){$common+=('/reference:'+[IO.Path]::Combine($framework,$ref))}
$sources=@();foreach($s in $shared){$sources+=[IO.Path]::Combine($parent,$s)}
foreach($s in $production){$sources+=[IO.Path]::Combine($PSScriptRoot,$s)};$sources+=$context
$reviewExe=[IO.Path]::Combine($root,'LauncherReview.exe')
$reviewTestExe=[IO.Path]::Combine($root,'LauncherReview.Tests.exe')
function Compile([string]$label,[string[]]$arguments) {
 $stdout=[IO.Path]::Combine($root,$label+'.stdout.txt');$stderr=[IO.Path]::Combine($root,$label+'.stderr.txt')
 $outFile=[IO.FileStream]::new($stdout,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read,4096,$true)
 $errFile=[IO.FileStream]::new($stderr,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read,4096,$true)
 $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$compiler;$start.UseShellExecute=$false
 # Compiler arguments originate only in this finite wrapper. Quote absolute source/output paths.
 $quoted=@();foreach($a in $arguments){if($a.Contains('"') -or $a.Contains([char]0)){throw 'invalid fixed compiler argument'};$quoted+=('"'+$a+'"')};$start.Arguments=$quoted -join ' '
 $start.WorkingDirectory='C:\Windows\System32';$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 $p=[Diagnostics.Process]::Start($start);[void]$p.Handle
 $a=$p.StandardOutput.BaseStream.CopyToAsync($outFile);$b=$p.StandardError.BaseStream.CopyToAsync($errFile)
 $clock=[Diagnostics.Stopwatch]::StartNew();$timeout=-not $p.WaitForExit(45000)
 if($timeout){$p.Kill()}
 $complete=[Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($a,$b),[int][Math]::Max(0,45000-$clock.ElapsedMilliseconds))
 if($complete){$outFile.Flush($true);$errFile.Flush($true);$outFile.Dispose();$errFile.Dispose()}
 $exit=$null;if($p.HasExited){$exit=$p.ExitCode}
 NewText ([IO.Path]::Combine($root,$label+'.metadata.json')) (@{ExitCode=$exit;TimedOut=$timeout;CaptureComplete=$complete;Arguments=$arguments} | Microsoft.PowerShell.Utility\ConvertTo-Json -Depth 4)
 if($timeout -or -not $complete -or $null -eq $exit -or $exit -ne 0){throw ('compile refusal '+$label+' '+$stdout+' '+$stderr)}
 $p.Dispose()
}
Compile 'review-production' ($common+@('/main:Omnira.Creative.Review.ReviewProgram',('/out:'+$reviewExe))+$sources)
$testSources=@($sources);foreach($s in $tests){$testSources+=[IO.Path]::Combine($PSScriptRoot,$s)}
Compile 'review-tests' ($common+@('/define:REVIEW_TEST','/main:Omnira.Creative.Review.TestProgram',('/out:'+$reviewTestExe))+$testSources)
if((HashFile $compiler) -cne $compilerHash -or (HashFile $runtime) -cne $runtimeHash -or (HashFile $info.HostExe) -cne $hostHash){throw 'build observation drift'}
$reviewDigests=@{};foreach($s in ($production+$tests+@('build.ps1','tests\run.ps1'))){$reviewDigests[$s]=HashFile ([IO.Path]::Combine($PSScriptRoot,$s))}
$reviewDigests['generated:ReleaseBuildContext.cs']=HashFile $context
$info | Microsoft.PowerShell.Utility\Add-Member -NotePropertyName ReviewExe -NotePropertyValue $reviewExe
$info | Microsoft.PowerShell.Utility\Add-Member -NotePropertyName ReviewTestExe -NotePropertyValue $reviewTestExe
$info | Microsoft.PowerShell.Utility\Add-Member -NotePropertyName ReviewSourceDigests -NotePropertyValue $reviewDigests
$result=$info | Microsoft.PowerShell.Utility\ConvertTo-Json -Depth 6 -Compress
NewText ([IO.Path]::Combine($root,'review-build.metadata.json')) $result
$result
