param([Parameter(Mandatory)][string]$Root,[Parameter(Mandatory)][string]$PythonPath,[Parameter(Mandatory)][guid]$ProjectId,[Parameter(Mandatory)][guid]$WorkerId,[Parameter(Mandatory)][string]$ManifestHash,[switch]$Apply)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'startup-plan.ps1')
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$plan=New-SalesStartupPlan -Root $Root -PythonPath $PythonPath -ProjectId $ProjectId -WorkerId $WorkerId -UserSid $sid -ManifestHash $ManifestHash
$service=New-Object -ComObject 'Schedule.Service';$service.Connect();$folder=$service.GetFolder('\Omnira');$existing=$folder.GetTask($plan.TaskName)
Assert-SalesStartupOwnership -ExistingXml $existing.Xml -Plan $plan
if(-not $Apply){'OWNED_TASK_REMOVAL_PREVIEW';return}
$existing.Stop(0);$folder.DeleteTask($plan.TaskName,0)
'REMOVED'
