$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
[Console]::InputEncoding = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$OutputEncoding = New-Object System.Text.UTF8Encoding($false)

$result = @{ ok = $false; error = 'uia_worker_error' }

try {
    Add-Type -AssemblyName UIAutomationClient
    Add-Type -AssemblyName UIAutomationTypes
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NovaUiaNative {
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern IntPtr GetWindow(IntPtr hWnd, uint command);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool IsWindowVisible(IntPtr hWnd);

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(
        IntPtr hWnd,
        out uint processId
    );
}
'@

    $raw = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($raw)) { throw 'missing_request' }
    $request = $raw | ConvertFrom-Json

    $allowedProcesses = @(
        'brave', 'chrome', 'msedge', 'firefox', 'spotify',
        'code', 'outlook', 'filezilla', 'epicgameslauncher', 'explorer'
    )
    $allowedReadProcesses = @('brave', 'chrome', 'msedge', 'firefox')
    $root = [System.Windows.Automation.AutomationElement]::RootElement
    $action = [string]$request.action

    if ($action -in @('find_desktop_window', 'read_desktop_window')) {
        $allowedReadProcesses = $allowedProcesses + @('notepad', 'olk', 'winword')
    }

    if ($action -eq 'inspect_app') {
        $processName = ([string]$request.processName).Trim().ToLowerInvariant()
        if ($processName.EndsWith('.exe')) {
            $processName = $processName.Substring(0, $processName.Length - 4)
        }
        if ($allowedProcesses -notcontains $processName) {
            throw 'process_not_allowlisted'
        }

        $maxElements = [Math]::Max(1, [Math]::Min(2000, [int]$request.maxElements))
        $processes = @(Get-Process -Name $processName -ErrorAction SilentlyContinue)
        $windows = New-Object System.Collections.Generic.List[object]

        foreach ($process in $processes) {
            $condition = New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::ProcessIdProperty,
                [int]$process.Id
            )
            $foundWindows = $root.FindAll(
                [System.Windows.Automation.TreeScope]::Children,
                $condition
            )

            foreach ($window in $foundWindows) {
                if ($window.Current.IsOffscreen) { continue }
                $handle = [long]$window.Current.NativeWindowHandle
                if ($handle -eq 0) { continue }

                $descendants = $window.FindAll(
                    [System.Windows.Automation.TreeScope]::Descendants,
                    [System.Windows.Automation.Condition]::TrueCondition
                )
                $counts = @{}
                $documentTextPatternCount = 0
                $scanCount = [Math]::Min($descendants.Count, $maxElements)

                for ($index = 0; $index -lt $scanCount; $index++) {
                    try {
                        $element = $descendants.Item($index)
                        $typeName = $element.Current.ControlType.ProgrammaticName
                        if ($typeName) {
                            $typeName = $typeName -replace '^ControlType\.', ''
                            if (-not $counts.ContainsKey($typeName)) {
                                $counts[$typeName] = 0
                            }
                            $counts[$typeName]++
                            if ($typeName -eq 'Document') {
                                $textPattern = $null
                                if ($element.TryGetCurrentPattern(
                                    [System.Windows.Automation.TextPattern]::Pattern,
                                    [ref]$textPattern
                                )) {
                                    $documentTextPatternCount++
                                }
                            }
                        }
                    } catch {
                        # An element can disappear while the tree is being read.
                    }
                }

                $windows.Add([pscustomobject]@{
                    processId = [int]$process.Id
                    processName = $processName
                    windowHandle = $handle
                    accessibleElementCount = [int]$descendants.Count
                    scannedElementCount = [int]$scanCount
                    controlTypeCounts = $counts
                    documentTextPatternCount = [int]$documentTextPatternCount
                })
            }
        }

        $result = @{
            ok = $true
            action = $action
            processName = $processName
            windows = @($windows.ToArray())
        }
    }
    elseif ($action -in @('find_foreground_browser', 'find_desktop_window')) {
        $ignoreProcessId = [int]$request.ignoreProcessId
        if ($ignoreProcessId -le 0) { throw 'invalid_ignored_process' }

        $handle = [NovaUiaNative]::GetForegroundWindow()
        $target = $null
        $seenHandles = New-Object 'System.Collections.Generic.HashSet[long]'

        # Skip Nova's own overlay process, then inspect only the first visible
        # application behind it. Never search deeper for another browser.
        for ($step = 0; $step -lt 100 -and $handle -ne [IntPtr]::Zero; $step++) {
            $handleValue = [long]$handle.ToInt64()
            if (-not $seenHandles.Add($handleValue)) { break }

            if ([NovaUiaNative]::IsWindowVisible($handle)) {
                [uint32]$processId = 0
                [void][NovaUiaNative]::GetWindowThreadProcessId($handle, [ref]$processId)
                if ($processId -gt 0 -and [int]$processId -ne $ignoreProcessId) {
                    $process = Get-Process -Id ([int]$processId) -ErrorAction SilentlyContinue
                    if ($null -eq $process) { throw 'foreground_process_unavailable' }

                    $processName = $process.ProcessName.ToLowerInvariant()
                    if ($allowedReadProcesses -notcontains $processName) {
                        throw 'foreground_app_not_browser'
                    }

                    $condition = New-Object System.Windows.Automation.PropertyCondition(
                        [System.Windows.Automation.AutomationElement]::NativeWindowHandleProperty,
                        [int]$handleValue
                    )
                    $window = $root.FindFirst(
                        [System.Windows.Automation.TreeScope]::Children,
                        $condition
                    )
                    if ($null -eq $window -or $window.Current.IsOffscreen) {
                        throw 'foreground_browser_not_accessible'
                    }

                    $target = [pscustomobject]@{
                        processName = $processName
                        processId = [int]$processId
                        windowHandle = $handleValue
                    }
                    break
                }
            }

            $handle = [NovaUiaNative]::GetWindow($handle, 2)
        }

        if ($null -eq $target) { throw 'no_visible_browser_window' }
        $result = @{
            ok = $true
            action = $action
            processName = $target.processName
            processId = $target.processId
            windowHandle = $target.windowHandle
        }
    }
    elseif ($action -in @('read_window', 'read_desktop_window')) {
        if ($request.allowReadContent -ne $true) {
            throw 'read_not_authorized'
        }

        $processName = ([string]$request.processName).Trim().ToLowerInvariant()
        $processId = [int]$request.processId
        $handleValue = [long]$request.windowHandle
        $ignoreProcessId = [int]$request.ignoreProcessId
        if ($allowedReadProcesses -notcontains $processName) {
            throw 'read_process_not_allowlisted'
        }
        if ($processId -le 0 -or $handleValue -le 0) {
            throw 'invalid_window_target'
        }

        $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($null -eq $process -or $process.ProcessName.ToLowerInvariant() -ne $processName) {
            throw 'target_process_changed'
        }

        if ($ignoreProcessId -le 0 -or $ignoreProcessId -eq $processId) {
            throw 'invalid_ignored_process'
        }

        # Revalidate the same topmost non-Nova window immediately before
        # reading. If focus changed after approval, fail closed.
        $top = [NovaUiaNative]::GetForegroundWindow()
        $topOtherHandle = [IntPtr]::Zero
        $seenHandles = New-Object 'System.Collections.Generic.HashSet[long]'
        for ($step = 0; $step -lt 100 -and $top -ne [IntPtr]::Zero; $step++) {
            $topValue = [long]$top.ToInt64()
            if (-not $seenHandles.Add($topValue)) { break }
            if ([NovaUiaNative]::IsWindowVisible($top)) {
                [uint32]$topProcessId = 0
                [void][NovaUiaNative]::GetWindowThreadProcessId($top, [ref]$topProcessId)
                if ($topProcessId -gt 0 -and [int]$topProcessId -ne $ignoreProcessId) {
                    $topOtherHandle = $top
                    break
                }
            }
            $top = [NovaUiaNative]::GetWindow($top, 2)
        }
        if ($topOtherHandle -eq [IntPtr]::Zero -or [long]$topOtherHandle.ToInt64() -ne $handleValue) {
            throw 'target_window_not_foreground'
        }

        $handle = [IntPtr]$handleValue
        if (-not [NovaUiaNative]::IsWindowVisible($handle)) {
            throw 'target_window_not_visible'
        }
        [uint32]$actualProcessId = 0
        [void][NovaUiaNative]::GetWindowThreadProcessId($handle, [ref]$actualProcessId)
        if ([int]$actualProcessId -ne $processId) {
            throw 'target_window_process_mismatch'
        }

        $condition = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::NativeWindowHandleProperty,
            [int]$handleValue
        )
        $window = $root.FindFirst(
            [System.Windows.Automation.TreeScope]::Children,
            $condition
        )
        if ($null -eq $window -or $window.Current.IsOffscreen) {
            throw 'target_window_not_found'
        }

        $maxChars = [Math]::Max(200, [Math]::Min(12000, [int]$request.maxChars))
        $descendants = $window.FindAll(
            [System.Windows.Automation.TreeScope]::Descendants,
            [System.Windows.Automation.Condition]::TrueCondition
        )
        $textParts = New-Object System.Collections.Generic.List[string]
        $seen = New-Object 'System.Collections.Generic.HashSet[string]'
        $sourceCount = 0

        foreach ($element in $descendants) {
            try {
                $current = $element.Current
                if ($current.IsOffscreen -or $current.IsPassword) { continue }
                if ($current.ControlType -ne [System.Windows.Automation.ControlType]::Document) {
                    if ($action -ne 'read_desktop_window') { continue }
                    $type = $current.ControlType.ProgrammaticName
                    $staticLabel = $type -eq 'ControlType.Pane' -and $current.ClassName -match '^(Static$|WindowsForms[0-9]+\.STATIC\.)'
                    if ($staticLabel -or $type -in @('ControlType.Text','ControlType.ListItem','ControlType.TreeItem','ControlType.Button')) {
                        $label = ([string]$current.Name).Trim()
                        if ($label -and $seen.Add($label)) { $textParts.Add($label); $sourceCount++ }
                        continue
                    }
                    if ($type -ne 'ControlType.Edit') { continue }
                }

                $pattern = $null
                if ($element.TryGetCurrentPattern(
                    [System.Windows.Automation.TextPattern]::Pattern,
                    [ref]$pattern
                )) {
                    $ranges = $pattern.GetVisibleRanges()
                    foreach ($range in $ranges) {
                        $piece = $range.GetText($maxChars)
                        if (-not [string]::IsNullOrWhiteSpace($piece)) {
                            $piece = $piece.Trim()
                            if ($seen.Add($piece)) {
                                $textParts.Add($piece)
                                $sourceCount++
                            }
                        }
                    }
                }
            } catch {
                # Keep reading other visible document fragments if one disappears.
            }
        }

        $combined = [string]::Join([Environment]::NewLine, $textParts.ToArray())
        $truncated = $combined.Length -gt $maxChars
        if ($truncated) { $combined = $combined.Substring(0, $maxChars) }
        if ([string]::IsNullOrWhiteSpace($combined)) {
            throw 'no_visible_document_text'
        }

        $result = @{
            ok = $true
            action = $action
            processName = $processName
            processId = $processId
            windowHandle = $handleValue
            sourceCount = [int]$sourceCount
            text = $combined
            truncated = [bool]$truncated
        }
    }
    else {
        throw 'unknown_action'
    }
}
catch {
    $errorCode = $_.Exception.Message
    if ($errorCode -notmatch '^[a-z0-9_]+$') {
        $errorCode = 'uia_worker_error'
    }
    $result = @{ ok = $false; error = $errorCode }
}

[Console]::Out.WriteLine((ConvertTo-Json -InputObject $result -Depth 8 -Compress))
