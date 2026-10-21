param([string]$Suite='Boundary')
$ErrorActionPreference='Stop'
$PSModuleAutoLoadingPreference='None'
Microsoft.PowerShell.Core\Import-Module 'C:\Windows\System32\WindowsPowerShell\v1.0\Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1'
if($Suite -ne 'Boundary' -and $Suite -ne 'Input'){throw 'unsupported suite'}
$build=& ([IO.Path]::Combine($PSScriptRoot,'..\build.ps1'))
$info=$build | Microsoft.PowerShell.Utility\ConvertFrom-Json
[Console]::WriteLine($build)
$start=New-Object System.Diagnostics.ProcessStartInfo
$start.FileName=$info.TestExe;$start.Arguments=$Suite;$start.UseShellExecute=$false
$start.WorkingDirectory='C:\Windows\System32'
$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
$p=[Diagnostics.Process]::Start($start)
$stdout=$p.StandardOutput.ReadToEndAsync();$stderr=$p.StandardError.ReadToEndAsync()
if(-not $p.WaitForExit(45000)){$p.Kill();[Console]::WriteLine('OUTER_TIMEOUT cleanupUnverified=true');exit 1}
$p.WaitForExit()
$stdoutPath=[IO.Path]::Combine($info.BuildRoot,($Suite+'.stdout.txt'))
$stderrPath=[IO.Path]::Combine($info.BuildRoot,($Suite+'.stderr.txt'))
$metadataPath=[IO.Path]::Combine($info.BuildRoot,($Suite+'.metadata.json'))
[IO.File]::WriteAllText($stdoutPath,$stdout.Result)
[IO.File]::WriteAllText($stderrPath,$stderr.Result)
$evidence=@{Suite=$Suite;ExitCode=$p.ExitCode;StdoutPath=$stdoutPath;StderrPath=$stderrPath;StdoutBytes=[IO.FileInfo]::new($stdoutPath).Length;StderrBytes=[IO.FileInfo]::new($stderrPath).Length;Build=$info}
[IO.File]::WriteAllText($metadataPath,($evidence | Microsoft.PowerShell.Utility\ConvertTo-Json -Depth 5))
[Console]::WriteLine($stdout.Result);[Console]::WriteLine($stderr.Result)
[Console]::WriteLine('EVIDENCE '+$metadataPath)
exit $p.ExitCode
