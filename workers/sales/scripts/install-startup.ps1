param([Parameter(Mandatory)][string]$Root,[Parameter(Mandatory)][string]$PythonPath,[Parameter(Mandatory)][guid]$ProjectId,[Parameter(Mandatory)][guid]$WorkerId,[Parameter(Mandatory)][string]$ManifestHash,[switch]$Apply)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'startup-plan.ps1')
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$plan=New-SalesStartupPlan -Root $Root -PythonPath $PythonPath -ProjectId $ProjectId -WorkerId $WorkerId -UserSid $sid -ManifestHash $ManifestHash
if(-not $Apply){$plan;return}
$service=New-Object -ComObject 'Schedule.Service';$service.Connect()
try{$folder=$service.GetFolder('\Omnira')}catch{$folder=$service.GetFolder('\').CreateFolder('Omnira')}
$existing=$null
try{$existing=$folder.GetTask($plan.TaskName)}catch{if($_.Exception.HResult -ne -2147024894){throw}}
if($null -ne $existing){Assert-SalesStartupOwnership -ExistingXml $existing.Xml -Plan $plan;'ALREADY_INSTALLED';return}
# TASK_CREATE, interactive logon, current SID, no password, no elevation.
$task=$folder.RegisterTask($plan.TaskName,$plan.Xml,2,$sid,$null,3,$null)
Assert-SalesStartupOwnership -ExistingXml $task.Xml -Plan $plan
'INSTALLED'
