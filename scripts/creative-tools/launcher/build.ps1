$ErrorActionPreference='Stop'
$PSModuleAutoLoadingPreference='None'
Microsoft.PowerShell.Core\Import-Module 'C:\Windows\System32\WindowsPowerShell\v1.0\Modules\Microsoft.PowerShell.Utility\Microsoft.PowerShell.Utility.psd1'
$framework='C:\Windows\Microsoft.NET\Framework64\v4.0.30319'
$root=[IO.Path]::Combine([IO.Path]::GetTempPath(),'omnira-launcher-build-'+[Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($root)
$shared=@('Contracts.cs','NativeMethods.cs','NativeResources.cs','WindowsProcessBoundary.cs','FixtureInput.cs','SyntheticProtocol.cs')
$test=@('tests\TestProgram.cs','tests\BoundaryTests.cs','tests\InputTests.cs','tests\ProtocolTests.cs')
$refs=@('mscorlib.dll','System.dll','System.Core.dll','System.Runtime.Serialization.dll')
$common=@('/nologo','/noconfig','/nostdlib+','/platform:x64','/target:exe','/optimize+')
foreach($ref in $refs){$common+=('/reference:'+[IO.Path]::Combine($framework,$ref))}
$hostExe=[IO.Path]::Combine($root,'SyntheticLauncher.exe')
$testExe=[IO.Path]::Combine($root,'SyntheticLauncher.Tests.exe')
$hostSources=@();foreach($s in ($shared+@('Program.cs'))){$hostSources+=[IO.Path]::Combine($PSScriptRoot,$s)}
$testSources=@();foreach($s in ($shared+$test)){$testSources+=[IO.Path]::Combine($PSScriptRoot,$s)}
$compileLog=[IO.Path]::Combine($root,'compile.log')
& "$framework\csc.exe" @common '/main:Omnira.Creative.Synthetic.Program' "/out:$hostExe" @hostSources *> $compileLog
if($LASTEXITCODE -ne 0){throw [IO.File]::ReadAllText($compileLog)}
& "$framework\csc.exe" @common '/define:TEST' '/main:Omnira.Creative.Synthetic.TestProgram' "/out:$testExe" @testSources *>> $compileLog
if($LASTEXITCODE -ne 0){throw [IO.File]::ReadAllText($compileLog)}
$digests=@{}
foreach($s in ($shared+@('Program.cs')+$test)){
 $sha=[Security.Cryptography.SHA256]::Create()
 try{$digests[$s]=[BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes([IO.Path]::Combine($PSScriptRoot,$s)))).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
}
@{HostExe=$hostExe;TestExe=$testExe;BuildRoot=$root;SourceDigests=$digests} | Microsoft.PowerShell.Utility\ConvertTo-Json -Depth 4 -Compress
