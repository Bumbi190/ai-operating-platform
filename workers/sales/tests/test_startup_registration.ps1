$ErrorActionPreference='Stop'
$root=Join-Path $env:LOCALAPPDATA ('OmniraSales/pilots/startup-registration-fixture-'+[guid]::NewGuid())
New-Item -ItemType Directory -Path $root | Out-Null
. (Join-Path $PSScriptRoot '../scripts/startup-plan.ps1')
$worker=[guid]::NewGuid();$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$plan=New-SalesStartupPlan -Root $root -PythonPath 'C:\Python312\python.exe' -ProjectId '10000000-0000-4000-8000-000000000001' -WorkerId $worker -UserSid $sid -ManifestHash ('a'*64)
[xml]$definition=$plan.Xml
$definition.Task.Settings.Enabled='false';$definition.Task.Triggers.LogonTrigger.Enabled='false';$plan.Xml=$definition.OuterXml
$service=New-Object -ComObject Schedule.Service;$service.Connect();$folder=$service.GetFolder('\Omnira');$created=$false
try{
 $task=$folder.RegisterTask($plan.TaskName,$plan.Xml,2,$sid,$null,3,$null);$created=$true
 if($task.Enabled -or $task.GetInstances(0).Count -ne 0){throw 'FIXTURE_NOT_DISABLED'}
 Assert-SalesStartupOwnership -ExistingXml $task.Xml -Plan $plan
 foreach($xml in @($task.Xml.Replace('<LogonType>InteractiveToken</LogonType>','<LogonType>Password</LogonType>'),$task.Xml.Replace('</Principal>','<RunLevel>HighestAvailable</RunLevel></Principal>'),$task.Xml.Replace('IgnoreNew','Parallel'),$task.Xml.Replace('PT1M','PT2M'),$task.Xml.Replace('</Settings>','<UnknownSetting>true</UnknownSetting></Settings>'),$task.Xml.Replace('C:\Python312\python.exe','C:\Windows\other.exe'))){
  $refused=$false;try{Assert-SalesStartupOwnership -ExistingXml $xml -Plan $plan}catch{$refused=$true};if(-not $refused){throw 'FOREIGN_SEMANTICS_ACCEPTED'}
 }
 'PASS: real disabled registration normalization, SID/default/order equality and foreign semantics refusal'
}finally{
 if($created){$folder.DeleteTask($plan.TaskName,0)}
 Remove-Item -LiteralPath $root -Force
}
