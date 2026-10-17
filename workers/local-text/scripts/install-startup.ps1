param([Parameter(Mandatory=$true)][string]$ConfigPath,[string]$NodePath=(Get-Command node.exe -ErrorAction Stop).Source,[switch]$Preview,[switch]$Apply)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'startup-plan.ps1')
if ($Apply -and $Preview) { throw 'CONFLICTING_MODE' }
$plan=Read-LocalTextStartupPlan -ConfigPath $ConfigPath -NodePath $NodePath
if (!$Apply) { $plan | ConvertTo-Json -Depth 8; exit 0 }
# Never overwrite even an owned existing task. Inspect/remove it explicitly.
if (Get-ScheduledTask -TaskName $plan.taskName -TaskPath $plan.taskPath -ErrorAction SilentlyContinue) { throw 'STARTUP_TASK_EXISTS' }
Register-ScheduledTask -TaskName $plan.taskName -TaskPath $plan.taskPath -Xml $plan.xml -ErrorAction Stop | Out-Null
@{status='installed';taskName=$plan.taskName;started=$false;requiresLogin=$true}|ConvertTo-Json -Compress
