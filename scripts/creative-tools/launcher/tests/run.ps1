param([string]$Suite='Boundary')
$ErrorActionPreference='Stop'
$PSModuleAutoLoadingPreference='None'
Microsoft.PowerShell.Core\Import-Module 'C:\Windows\System32\WindowsPowerShell\v1.0\Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1'
if($Suite -notin @('All','Cli','Boundary','Input','Protocol','Lifecycle','LifecycleDeadline','Cleanup','Crash')){throw 'unsupported suite'}
if($Suite -eq 'All'){
 foreach($childSuite in @('Cli','Boundary','Input','Protocol','Lifecycle','LifecycleDeadline','Cleanup','Crash')){
  & 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe' -NoProfile -NonInteractive -File $PSCommandPath -Suite $childSuite
  if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
 }
 [Console]::WriteLine('Suite=All, Passed=true, Skipped=0');exit 0
}
$build=& ([IO.Path]::Combine($PSScriptRoot,'..\build.ps1'))
$info=$build | Microsoft.PowerShell.Utility\ConvertFrom-Json
[Console]::WriteLine($build)
$stdoutPath=[IO.Path]::Combine($info.BuildRoot,($Suite+'.stdout.txt'))
$stderrPath=[IO.Path]::Combine($info.BuildRoot,($Suite+'.stderr.txt'))
$metadataPath=[IO.Path]::Combine($info.BuildRoot,($Suite+'.metadata.json'))
$ownedOutput=[IO.Path]::Combine($info.BuildRoot,$Suite+'.owned.stdout.txt')
$ownedError=[IO.Path]::Combine($info.BuildRoot,$Suite+'.owned.stderr.txt')
$start=New-Object System.Diagnostics.ProcessStartInfo
$start.FileName=$info.TestExe;$start.Arguments='Watchdog '+$Suite;$start.UseShellExecute=$false
$start.WorkingDirectory='C:\Windows\System32'
$start.EnvironmentVariables.Clear()
$start.EnvironmentVariables['LOCALAPPDATA']=[Environment]::GetFolderPath('LocalApplicationData')
$start.EnvironmentVariables['SystemRoot']='C:\Windows';$start.EnvironmentVariables['WINDIR']='C:\Windows'
$start.EnvironmentVariables['PATH']='C:\Windows\System32'
$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
$outFile=[IO.FileStream]::new($stdoutPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::ReadWrite,1,$true)
$errFile=[IO.FileStream]::new($stderrPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::ReadWrite,1,$true)
$clock=[Diagnostics.Stopwatch]::StartNew()
$p=[Diagnostics.Process]::Start($start)
# Retain the exact Process/SafeHandle; only this created watchdog can be stopped.
[void]$p.Handle
$stdout=$p.StandardOutput.BaseStream.CopyToAsync($outFile)
$stderr=$p.StandardError.BaseStream.CopyToAsync($errFile)
$timedOut=-not $p.WaitForExit([int][Math]::Max(0,45000-$clock.ElapsedMilliseconds))
if($timedOut){$p.Kill();[Console]::WriteLine('OUTER_TIMEOUT cleanupUnverified=true')}
$remaining=[int][Math]::Max(0,45000-$clock.ElapsedMilliseconds)
$captureComplete=[Threading.Tasks.Task]::WaitAll([Threading.Tasks.Task[]]@($stdout,$stderr),$remaining)
# No per-stream wait extension, and no synchronous disposal under pending writes.
if($captureComplete){$outFile.Flush();$errFile.Flush();$outFile.Dispose();$errFile.Dispose()}
$exitCode=$null;if($p.HasExited){$exitCode=$p.ExitCode}
$evidence=@{Suite=$Suite;OuterLimitMs=45000;TimedOut=$timedOut;CaptureComplete=$captureComplete;ExitCode=$exitCode;StdoutPath=$stdoutPath;StderrPath=$stderrPath;OwnedStdoutPath=$ownedOutput;OwnedStderrPath=$ownedError;StdoutBytes=[IO.FileInfo]::new($stdoutPath).Length;StderrBytes=[IO.FileInfo]::new($stderrPath).Length;Build=$info}
[IO.File]::WriteAllText($metadataPath,($evidence | Microsoft.PowerShell.Utility\ConvertTo-Json -Depth 5))
[Console]::WriteLine('EVIDENCE '+$metadataPath)
foreach($path in @($stdoutPath,$stderrPath,$ownedOutput,$ownedError)){if([IO.File]::Exists($path)){[Console]::WriteLine([IO.File]::ReadAllText($path))}}
if($timedOut -or -not $captureComplete -or $null -eq $exitCode){exit 1}
exit $exitCode
