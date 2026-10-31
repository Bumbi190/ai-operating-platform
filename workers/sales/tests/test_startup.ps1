$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '../scripts/startup-plan.ps1')
$original=$env:LOCALAPPDATA
$tmp=Join-Path ([IO.Path]::GetTempPath()) ('OmniraSales-test-'+[guid]::NewGuid())
try {
 $env:LOCALAPPDATA=$tmp
 $root=Join-Path $tmp 'OmniraSales/pilots/source & spaces'
 New-Item -ItemType Directory -Force $root | Out-Null
 $python=Join-Path $root 'python.exe';[IO.File]::WriteAllText($python,'fixture')
 $params=@{Root=$root;PythonPath=$python;ProjectId='10000000-0000-4000-8000-000000000001';WorkerId='60000000-0000-4000-8000-000000000001';UserSid='S-1-5-21-1-2-3-1001';ManifestHash=('a'*64)}
 $plan=New-SalesStartupPlan @params
 [xml]$xml=$plan.Xml
 if($plan.TaskPath -ne '\Omnira\' -or $plan.TaskName -ne ('Omnira-Sales-'+$params.WorkerId)){throw 'Wrong task scope'}
 if($xml.Task.Principals.Principal.LogonType -ne 'InteractiveToken' -or $xml.Task.Principals.Principal.RunLevel -ne 'LeastPrivilege'){throw 'Wrong privilege'}
 if($xml.Task.Settings.MultipleInstancesPolicy -ne 'IgnoreNew' -or $xml.Task.Settings.RestartOnFailure.Count -ne '3'){throw 'Wrong restart policy'}
 if($xml.Task.Actions.Exec.WorkingDirectory -ne $root){throw 'XML escaping broke path'}
 Assert-SalesStartupOwnership -ExistingXml $plan.Xml -Plan $plan
 $scheduler=New-Object -ComObject 'Schedule.Service';$scheduler.Connect();$definition=$scheduler.NewTask(0);$definition.XmlText=$plan.Xml
 Assert-SalesStartupOwnership -ExistingXml $definition.XmlText -Plan $plan
 $foreign=$plan.Xml.Replace('python.exe','other.exe');$rejected=$false
 try{Assert-SalesStartupOwnership -ExistingXml $foreign -Plan $plan}catch{$rejected=$true}
 if(-not $rejected){throw 'Foreign action accepted'}
 $foreign=$plan.Xml.Replace($params.UserSid,'S-1-5-18');$rejected=$false
 try{Assert-SalesStartupOwnership -ExistingXml $foreign -Plan $plan}catch{$rejected=$true}
 if(-not $rejected){throw 'SYSTEM accepted'}
 $params.Root='C:\Windows';$rejected=$false
 try{New-SalesStartupPlan @params}catch{$rejected=$true}
 if(-not $rejected){throw 'Unowned directory accepted'}
 'PASS: startup XML, identity, spaces, foreign action/principal and path ownership; no task registered'
} finally {$env:LOCALAPPDATA=$original;Remove-Item -LiteralPath $tmp -Recurse -Force}
