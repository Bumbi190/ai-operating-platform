param([Parameter(Mandatory=$true)][string]$ConfigPath,[string]$NodePath=(Get-Command node.exe -ErrorAction Stop).Source,[switch]$Preview,[switch]$Apply)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'startup-plan.ps1')
if ($Apply -and $Preview) { throw 'CONFLICTING_MODE' }
$plan=Read-LocalTextStartupPlan -ConfigPath $ConfigPath -NodePath $NodePath
$task=Get-ScheduledTask -TaskName $plan.taskName -TaskPath $plan.taskPath -ErrorAction SilentlyContinue
if ($task) { $xml=Export-ScheduledTask -TaskName $plan.taskName -TaskPath $plan.taskPath;if (!(Test-LocalTextStartupOwnership -Xml $xml -Plan $plan)) { throw 'FOREIGN_STARTUP_TASK' } }
if (!$Apply) { @{taskName=$plan.taskName;taskPath=$plan.taskPath;owned=($null -ne $task);action='disable_stop_unregister_exact_task';serverRevocationRequired=$true;rollback=$plan.rollback}|ConvertTo-Json -Depth 4;exit 0 }
if ($task) { Disable-ScheduledTask -TaskName $plan.taskName -TaskPath $plan.taskPath | Out-Null;Stop-ScheduledTask -TaskName $plan.taskName -TaskPath $plan.taskPath;Unregister-ScheduledTask -TaskName $plan.taskName -TaskPath $plan.taskPath -Confirm:$false }
@{status='removed';serverRevocationRequired=$true;unknownHoldsCleared=$false}|ConvertTo-Json -Compress
