Set-StrictMode -Version Latest
function Assert-SalesOwnedPath([string]$Path,[string]$Base) {
 $full=[IO.Path]::GetFullPath($Path);$owned=[IO.Path]::GetFullPath($Base).TrimEnd('\')+'\'
 if(-not $full.StartsWith($owned,[StringComparison]::OrdinalIgnoreCase)){throw 'UNOWNED_PATH'}
 $item=Get-Item -LiteralPath $full -Force -ErrorAction Stop
 while($null -ne $item){if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'REPARSE_POINT_REFUSED'};$item=$item.Parent}
 return $full
}
function New-SalesStartupPlan {
 param([Parameter(Mandatory)][string]$Root,[Parameter(Mandatory)][string]$PythonPath,[Parameter(Mandatory)][guid]$ProjectId,[Parameter(Mandatory)][guid]$WorkerId,[Parameter(Mandatory)][string]$UserSid,[Parameter(Mandatory)][string]$ManifestHash)
 if($UserSid -notmatch '^S-1-5-21-\d+-\d+-\d+-\d+$' -or $ManifestHash -notmatch '^[a-f0-9]{64}$'){throw 'INVALID_IDENTITY'}
 $rootFull=Assert-SalesOwnedPath $Root (Join-Path $env:LOCALAPPDATA 'OmniraSales/pilots')
 $pythonFull=[IO.Path]::GetFullPath($PythonPath)
 if(-not [IO.Path]::IsPathRooted($PythonPath) -or [IO.Path]::GetExtension($PythonPath) -ne '.exe' -or -not (Test-Path -LiteralPath $pythonFull -PathType Leaf)){throw 'INVALID_PYTHON'}
 $exeItem=Get-Item -LiteralPath $pythonFull
 while($null -ne $exeItem){if(($exeItem.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'REPARSE_POINT_REFUSED'};$exeItem=if($exeItem -is [IO.FileInfo]){$exeItem.Directory}else{$exeItem.Parent}}
 $name='Omnira-Sales-'+$WorkerId.ToString();$description='OmniraSales managed host v1; worker='+$WorkerId+'; project='+$ProjectId+'; manifest='+$ManifestHash
 $escape={param($v)[Security.SecurityElement]::Escape([string]$v)}
 $pythonXml=& $escape $pythonFull;$rootXml=& $escape $rootFull;$descriptionXml=& $escape $description
 $arguments='-m workers.sales.cli host --project '+$ProjectId.ToString()
 $xml=@"
<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.4" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
 <RegistrationInfo><Description>$descriptionXml</Description></RegistrationInfo>
 <Triggers><LogonTrigger><Enabled>true</Enabled><UserId>$UserSid</UserId></LogonTrigger></Triggers>
 <Principals><Principal id="User"><UserId>$UserSid</UserId><LogonType>InteractiveToken</LogonType><RunLevel>LeastPrivilege</RunLevel></Principal></Principals>
 <Settings><MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy><DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries><StopIfGoingOnBatteries>false</StopIfGoingOnBatteries><AllowHardTerminate>true</AllowHardTerminate><StartWhenAvailable>true</StartWhenAvailable><RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable><IdleSettings><StopOnIdleEnd>true</StopOnIdleEnd><RestartOnIdle>false</RestartOnIdle></IdleSettings><AllowStartOnDemand>true</AllowStartOnDemand><Enabled>true</Enabled><Hidden>false</Hidden><RunOnlyIfIdle>false</RunOnlyIfIdle><DisallowStartOnRemoteAppSession>false</DisallowStartOnRemoteAppSession><UseUnifiedSchedulingEngine>false</UseUnifiedSchedulingEngine><WakeToRun>false</WakeToRun><ExecutionTimeLimit>PT0S</ExecutionTimeLimit><Priority>7</Priority><RestartOnFailure><Interval>PT1M</Interval><Count>3</Count></RestartOnFailure></Settings>
 <Actions Context="User"><Exec><Command>$pythonXml</Command><Arguments>$arguments</Arguments><WorkingDirectory>$rootXml</WorkingDirectory></Exec></Actions>
</Task>
"@
 return [pscustomobject]@{TaskPath='\Omnira\';TaskName=$name;Xml=$xml;UserSid=$UserSid;Description=$description}
}
function Assert-SalesStartupOwnership {
 param([Parameter(Mandatory)][string]$ExistingXml,[Parameter(Mandatory)]$Plan)
 [xml]$actual=$ExistingXml;[xml]$expected=$Plan.Xml
 # Compare the complete task tree, including triggers/settings/actions. Whitespace and
 # scheduler-added registration URI/date/author are the only irrelevant differences.
 foreach($doc in @($actual,$expected)){
  $ns=[Xml.XmlNamespaceManager]::new($doc.NameTable);$ns.AddNamespace('t','http://schemas.microsoft.com/windows/2004/02/mit/task')
  foreach($xpath in @('//t:RegistrationInfo/t:URI','//t:RegistrationInfo/t:Date','//t:RegistrationInfo/t:Author')){foreach($n in @($doc.SelectNodes($xpath,$ns))){[void]$n.ParentNode.RemoveChild($n)}}
 }
 if($actual.DocumentElement.OuterXml -ne $expected.DocumentElement.OuterXml){throw 'FOREIGN_TASK_REFUSED'}
}
