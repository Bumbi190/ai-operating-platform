# No Ollama, identity, scheduler or network. Only these explicitly created test children.
$ErrorActionPreference='Stop'
Add-Type -Path (Join-Path $PSScriptRoot 'owned-job.cs')
$node=(Get-Command node.exe).Source
$foreign=Start-Process -FilePath $node -ArgumentList '-e "setTimeout(()=>{},60000)"' -WindowStyle Hidden -PassThru
$job=New-Object Omnira.LocalText.OwnedJob;$owned=$null
try {
 $envs=@('SystemRoot='+$env:SystemRoot,'PATH='+$env:PATH,'TEMP='+$env:TEMP)
 $owned=$job.Start($node,'-e "require(''node:child_process'').spawn(process.execPath,[''-e'',''setTimeout(()=>{},60000)'']);setTimeout(()=>{},60000)"',$PSScriptRoot,$envs)
 $until=[DateTime]::UtcNow.AddSeconds(5);while($job.Active -lt 2 -and [DateTime]::UtcNow -lt $until){Start-Sleep -Milliseconds 20}
 if ($job.Active -lt 2) {throw 'DESCENDANT_NOT_IN_JOB'}
 $empty=$job.TerminateAndWait(5000)
 $closeJob=New-Object Omnira.LocalText.OwnedJob
 $closeChild=$closeJob.Start($node,'-e "setTimeout(()=>{},60000)"',$PSScriptRoot,$envs)
 $closeJob.Dispose();$until=[DateTime]::UtcNow.AddSeconds(5);while(!$closeChild.Exited -and [DateTime]::UtcNow -lt $until){Start-Sleep -Milliseconds 20}
 $closeKilled=$closeChild.Exited;$closeChild.Dispose()
 $foreign.Refresh()
 @{closeKilled=$closeKilled;assignedBeforeResume=$owned.AssignedBeforeResume;kernelEmpty=$empty;ownedExited=$owned.Exited;foreignAlive=(!$foreign.HasExited)}|ConvertTo-Json -Compress
} finally {$job.Dispose();if($owned){$owned.Dispose()};if(!$foreign.HasExited){$foreign.Kill();$foreign.WaitForExit(5000)|Out-Null};$foreign.Dispose()}
