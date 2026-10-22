param([string]$Suite='Codec')
$ErrorActionPreference='Stop'
$PSModuleAutoLoadingPreference='None'
Microsoft.PowerShell.Core\Import-Module 'C:\Windows\System32\WindowsPowerShell\v1.0\Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1'
if($Suite -cne 'Codec' -and $Suite -cne 'Files' -and $Suite -cne 'All'){throw 'unsupported suite'}
$build=& ([IO.Path]::Combine($PSScriptRoot,'..\build.ps1'))
$info=$build | Microsoft.PowerShell.Utility\ConvertFrom-Json
[Console]::WriteLine($build)
$nonce=[Guid]::NewGuid().ToString('N')
$stdoutPath=[IO.Path]::Combine($info.BuildRoot,$Suite+'-'+$nonce+'.stdout.txt')
$stderrPath=[IO.Path]::Combine($info.BuildRoot,$Suite+'-'+$nonce+'.stderr.txt')
$metadataPath=[IO.Path]::Combine($info.BuildRoot,$Suite+'-'+$nonce+'.metadata.json')
$outFile=[IO.FileStream]::new($stdoutPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read,4096,$true)
$errFile=[IO.FileStream]::new($stderrPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read,4096,$true)
$start=[Diagnostics.ProcessStartInfo]::new()
$start.FileName=$info.ReviewTestExe;$start.Arguments=$Suite;$start.UseShellExecute=$false
$start.WorkingDirectory='C:\Windows\System32';$start.EnvironmentVariables.Clear()
$start.EnvironmentVariables['SystemRoot']='C:\Windows';$start.EnvironmentVariables['WINDIR']='C:\Windows';$start.EnvironmentVariables['PATH']='C:\Windows\System32'
$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
$clock=[Diagnostics.Stopwatch]::StartNew();$p=[Diagnostics.Process]::Start($start);[void]$p.Handle
$stdout=$p.StandardOutput.BaseStream.CopyToAsync($outFile);$stderr=$p.StandardError.BaseStream.CopyToAsync($errFile)
$timedOut=-not $p.WaitForExit([int][Math]::Max(0,45000-$clock.ElapsedMilliseconds))
if($timedOut){$p.Kill();[Console]::WriteLine('OUTER_TIMEOUT cleanupUnverified=true')}
$captureComplete=[Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($stdout,$stderr),[int][Math]::Max(0,45000-$clock.ElapsedMilliseconds))
if($captureComplete){$outFile.Flush($true);$errFile.Flush($true);$outFile.Dispose();$errFile.Dispose()}
$exitCode=$null;if($p.HasExited){$exitCode=$p.ExitCode}
$evidence=@{Suite=$Suite;OuterLimitMs=45000;TimedOut=$timedOut;CaptureComplete=$captureComplete;ExitCode=$exitCode;StdoutPath=$stdoutPath;StderrPath=$stderrPath;Build=$info}
$f=[IO.File]::Open($metadataPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
try{$b=[Text.UTF8Encoding]::new($false,$true).GetBytes(($evidence | Microsoft.PowerShell.Utility\ConvertTo-Json -Depth 7));$f.Write($b,0,$b.Length);$f.Flush($true)}finally{$f.Dispose()}
[Console]::WriteLine('EVIDENCE '+$metadataPath)
if($captureComplete){[Console]::WriteLine([IO.File]::ReadAllText($stdoutPath));[Console]::WriteLine([IO.File]::ReadAllText($stderrPath))}
if($timedOut -or -not $captureComplete -or $null -eq $exitCode){exit 1}
$p.Dispose();exit $exitCode
