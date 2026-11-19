$ErrorActionPreference = 'Stop'
$desktop = [Environment]::GetFolderPath('Desktop')
$python = 'C:\Python312\pythonw.exe'
$entry = 'C:\Users\Andre\AppData\Local\Omnira\OfficeLauncher\workflow\bb68099898a945429097abde08c113f21fdde168ef46687cea4a9bdffd2b10a7\office_workflow_entry.py'
$project = 'C:\Users\Andre\Projects\Omnira\Design\Agent-Campus-3D\UnrealPilot\Omnira_Office_CastQA_v83'
$icon = 'C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor.exe,0'
$arguments = '-I -B "' + $entry + '" --workflow-visit'
if (!(Test-Path -LiteralPath $python -PathType Leaf) -or !(Test-Path -LiteralPath $entry -PathType Leaf)) { throw 'Verified Office start target missing' }
$path = Join-Path $desktop 'Omnira Office - Levande Pling.lnk'
$shell = New-Object -ComObject WScript.Shell
$created = !(Test-Path -LiteralPath $path)
$link = $shell.CreateShortcut($path)
if (!$created) {
    if ($link.TargetPath -ne $python -or $link.Arguments -cne $arguments -or $link.WorkingDirectory -ne $project) { throw 'Existing shortcut differs; preserved' }
} else {
    $link.TargetPath = $python
    $link.Arguments = $arguments
    $link.WorkingDirectory = $project
    $link.IconLocation = $icon
    $link.Description = 'Nytt Office-besok med verifierad arbetsstatus for Familje-Pling'
    $link.WindowStyle = 1
    $link.Save()
}
$verified = $shell.CreateShortcut($path)
if ($verified.TargetPath -ne $python -or $verified.Arguments -cne $arguments -or $verified.WorkingDirectory -ne $project) { throw 'Shortcut verification failed' }
$out = 'C:\Users\Andre\Projects\Omnira\Temp\office-live-start-20261119'
New-Item -ItemType Directory -Path $out -Force | Out-Null
Copy-Item -LiteralPath $path -Destination (Join-Path $out 'Omnira Office - Levande Pling.lnk')
$result = [ordered]@{ created=$created; verified=$true; path=$path; target=$python; arguments=$arguments; working_directory=$project; icon=$icon; source_bundle_unchanged=$true; same_fixed_action_as_tested=$true; relaunched_existing_game=$false }
$result | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $out 'shortcut.json') -Encoding UTF8
$result | ConvertTo-Json -Compress
