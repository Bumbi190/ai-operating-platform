$ErrorActionPreference='Stop'
function New-LocalTextStartupPlan {
 param([string]$DeviceId,[string]$ConfigPath,[string]$NodePath,[string]$SupervisorPath,[string]$UserSid)
 if ($DeviceId -notmatch '^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' -or $UserSid -notmatch '^S-1-5-21-[0-9-]+$') { throw 'INVALID_STARTUP_SCOPE' }
 foreach ($p in @($ConfigPath,$NodePath,$SupervisorPath)) { if (![IO.Path]::IsPathRooted($p) -or $p -match '["\r\n\x00]') { throw 'INVALID_STARTUP_PATH' } }
 $name='Omnira-Atlas-LocalText-'+$DeviceId
 $arguments='"'+$SupervisorPath+'" --config "'+$ConfigPath+'"'
 $marker='Omnira.LocalText.v1|'+$UserSid+'|'+$ConfigPath+'|'+$SupervisorPath
 $escape={param($v) [Security.SecurityElement]::Escape($v)}
 $xml=@"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
 <RegistrationInfo><Description>$(& $escape $marker)</Description></RegistrationInfo>
 <Triggers><LogonTrigger><Enabled>true</Enabled><UserId>$UserSid</UserId></LogonTrigger></Triggers>
 <Principals><Principal id="Owner"><UserId>$UserSid</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
 <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><StartWhenAvailable>false</StartWhenAvailable><RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><Enabled>true</Enabled></Settings>
 <Actions Context="Owner"><Exec><Command>$(& $escape $NodePath)</Command><Arguments>$(& $escape $arguments)</Arguments></Exec></Actions>
</Task>
"@
 return @{taskName=$name;taskPath='\Omnira\';account=$UserSid;command=$NodePath;arguments=$arguments;marker=$marker;xml=$xml;requiresLogin=$true;rollback='Revoke this exact device in the owned Omnira project first (cancels undispatched jobs; uncertain dispatched work remains held). Preview remove-startup.ps1, then apply removal for this exact task. No generic process cleanup.'}
}
function Test-LocalTextStartupOwnership {
 param([string]$Xml,$Plan)
 try { [xml]$doc=$Xml;$ns=New-Object Xml.XmlNamespaceManager($doc.NameTable);$ns.AddNamespace('t','http://schemas.microsoft.com/windows/2004/02/mit/task');$get={param($q) $doc.SelectSingleNode($q,$ns).InnerText}
 return (($doc.SelectNodes('/t:Task/t:Actions/t:Exec',$ns).Count -eq 1) -and (& $get '/t:Task/t:RegistrationInfo/t:Description') -ceq $Plan.marker -and (& $get '/t:Task/t:Principals/t:Principal/t:UserId') -ceq $Plan.account -and (& $get '/t:Task/t:Actions/t:Exec/t:Command') -ceq $Plan.command -and (& $get '/t:Task/t:Actions/t:Exec/t:Arguments') -ceq $Plan.arguments)
 } catch { return $false }
}
function Read-LocalTextStartupPlan {
 param([string]$ConfigPath,[string]$NodePath)
 $base=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'));$config=Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
 $expected=Join-Path $base ('.local-state\'+$config.deviceId+'\config.json')
 if ([IO.Path]::GetFullPath($ConfigPath) -cne $expected -or !(Test-Path -LiteralPath $NodePath -PathType Leaf) -or [IO.Path]::GetFileName($NodePath) -ine 'node.exe') { throw 'INVALID_STARTUP_PATH' }
 foreach ($p in @($ConfigPath,$NodePath,$base)) { if ((Get-Item -LiteralPath $p).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'REPARSE_PATH_REFUSED' } }
 New-LocalTextStartupPlan -DeviceId $config.deviceId -ConfigPath $expected -NodePath ([IO.Path]::GetFullPath($NodePath)) -SupervisorPath (Join-Path $base 'supervisor.mjs') -UserSid ([Security.Principal.WindowsIdentity]::GetCurrent().User.Value)
}
