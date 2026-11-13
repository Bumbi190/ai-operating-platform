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

    function Get-BrowserAddress($window) {
        $condition = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
            [System.Windows.Automation.ControlType]::Edit
        )
        $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
        foreach ($edit in $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $condition)) {
            if ($edit.Current.IsOffscreen -or $edit.Current.IsPassword) { continue }
            $current = $edit.Current
            if ($current.ClassName -notin @('OmniboxViewViews','BraveOmniboxViewViews') -and
                $current.AutomationId -notin @('urlbar-input','addressEditBox') -and
                $current.Name -notmatch '(?i)address and search bar|adress-? och s.kf.lt|adressf.lt') { continue }
            $parent = $walker.GetParent($edit)
            while ($null -ne $parent -and !$parent.Equals($window)) {
                if ($parent.Current.ControlType -eq [System.Windows.Automation.ControlType]::Document) { break }
                $parent = $walker.GetParent($parent)
            }
            if (!$parent -or !$parent.Equals($window)) { continue }
            $pattern = $null
            if (!$edit.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern,[ref]$pattern)) { continue }
            $address = $pattern.Current.Value
            if ($address) { return $address }
        }
        return ''
    }

    function Test-PageAddress($window) {
        $address = Get-BrowserAddress $window
        if (!$address) { return $false }
        if ($request.expectedSite -eq 'chatgpt') {
            return $address -match '^(?:https://)?(?:chatgpt\.com|chat\.openai\.com)(?:/|$)'
        }
        if ($address -notmatch '^https?://') {
            # Chromium may omit the scheme in the accessible address bar.
            $address = ([uri]$request.expectedUrl).Scheme + '://' + $address
        }
        try {
            $actual = [uri]$address
            $expected = [uri]$request.expectedUrl
            if ($actual.IdnHost -eq $expected.IdnHost -and $actual.AbsolutePath -match '^/(?:login|sign-in)(?:/|$)' -and
                    $expected.AbsolutePath -ne $actual.AbsolutePath) { throw 'login_needed' }
            return ($actual.Scheme -eq $expected.Scheme -and $actual.Port -eq $expected.Port -and
                ($actual.IdnHost -replace '^www\.','') -eq ($expected.IdnHost -replace '^www\.','') -and
                $actual.AbsolutePath.TrimEnd('/') -ceq $expected.AbsolutePath.TrimEnd('/') -and
                (!$expected.Query -or $actual.Query -ceq $expected.Query) -and
                (!$expected.Fragment -or $actual.Fragment -ceq $expected.Fragment))
        } catch {
            if ($_.Exception.Message -eq 'login_needed') { throw }
            return $false
        }
    }

    function Get-VerifiedTabAddress($window, $expectedUrl, $numbered) {
        $address = Get-BrowserAddress $window
        if (!$address) { return }
        $expected = if ($expectedUrl) { [uri]$expectedUrl }
        if ($address -notmatch '^https?://') {
            $scheme = if ($expected) { $expected.Scheme } else { 'https' }
            $address = $scheme + '://' + $address
        }
        $actual = $null
        if (![uri]::TryCreate($address, [UriKind]::Absolute, [ref]$actual) -or
                $actual.Scheme -notin @('http','https') -or $actual.UserInfo) { return }
        if (!$expected) { return $actual }
        $domainMatches = $actual.IdnHost -eq $expected.IdnHost
        # A known dictation spelling is accepted only with a matching numbered
        # heading on an already-open document. Never navigate to either address.
        if ($numbered -and $expected.IdnHost -eq 'hermots.omniway.se' -and $actual.IdnHost -eq 'hermods.omniway.se') {
            $domainMatches = $true
        }
        if ($domainMatches -and $actual.Scheme -eq $expected.Scheme -and $actual.Port -eq $expected.Port -and
            ($expected.AbsolutePath -eq '/' -or $actual.AbsolutePath -ceq $expected.AbsolutePath) -and
            (!$expected.Query -or $actual.Query -ceq $expected.Query) -and
            (!$expected.Fragment -or $actual.Fragment -ceq $expected.Fragment)) { return $actual }
    }

    function Read-NamedTab {
        if ($request.allowReadContent -ne $true) { throw 'read_not_authorized' }
        $browser = [string]$request.browser
        $heading = [string]$request.heading
        if ($browser -and $browser -notin $allowedReadProcesses) { throw 'invalid_browser' }
        if ($heading -and $heading -notmatch '^(lektion|kapitel|avsnitt|modul) [0-9]{1,3}$') { throw 'invalid_heading' }
        $expectedUrl = [string]$request.expectedUrl
        if ($expectedUrl -and $expectedUrl -notmatch '^https?://') { throw 'invalid_tab_address' }
        $titlePattern = '(?i)(?<!\w)' + [regex]::Escape($heading) + '(?!\w)'
        $bodyPattern = '(?im)^\s*' + [regex]::Escape($heading) + '(?!\w)'
        $tabCondition = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::TabItem)
        $docCondition = New-Object System.Windows.Automation.PropertyCondition(
            [System.Windows.Automation.AutomationElement]::ControlTypeProperty, [System.Windows.Automation.ControlType]::Document)
        $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
        $candidates = @()
        foreach ($window in $root.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
            $process = Get-Process -Id $window.Current.ProcessId -ErrorAction SilentlyContinue
            if (!$process -or $process.ProcessName -notin $allowedReadProcesses -or
                ($browser -and $browser -ne $process.ProcessName) -or $window.Current.IsOffscreen) { continue }
            if ($request.windowHandle -and $window.Current.NativeWindowHandle -ne [long]$request.windowHandle) { continue }
            $prior = $null
            $windowCandidates = @()
            foreach ($tab in $window.FindAll([System.Windows.Automation.TreeScope]::Descendants, $tabCondition)) {
                $parent = $walker.GetParent($tab)
                while ($parent -and !$parent.Equals($window) -and $parent.Current.ControlType -ne [System.Windows.Automation.ControlType]::Document) {
                    $parent = $walker.GetParent($parent)
                }
                if (!$parent -or !$parent.Equals($window)) { continue }
                $selection = $null
                if (!$tab.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern,[ref]$selection)) { continue }
                $selected = $selection.Current.IsSelected
                if ($selected) { $prior = $selection }
                if ($heading) {
                    if ($tab.Current.Name -notmatch $titlePattern) { continue }
                } elseif (!$selected) { continue }
                if ($selected -and !(Get-VerifiedTabAddress $window $expectedUrl $heading)) { continue }
                $windowCandidates += @{ tab=$tab; selection=$selection; window=$window }
            }
            foreach ($match in $windowCandidates) { $match.prior = $prior; $candidates += $match }
        }
        if (!$candidates.Count) { throw 'tab_not_found' }
        if ($candidates.Count -ne 1) { throw 'tab_not_unique' }
        $item = $candidates[0]
        $switched = !$item.selection.Current.IsSelected
        if ($switched) { $item.selection.Select() }
        try {
            $deadline = [DateTime]::UtcNow.AddSeconds(3)
            do {
                if ($switched) { Start-Sleep -Milliseconds 120 }
                if (!$item.selection.Current.IsSelected -or ($heading -and $item.tab.Current.Name -notmatch $titlePattern)) { throw 'requested_tab_changed' }
                $uri = Get-VerifiedTabAddress $item.window $expectedUrl $heading
                $best = ''
                if ($uri) {
                    foreach ($document in $item.window.FindAll([System.Windows.Automation.TreeScope]::Descendants,$docCondition)) {
                        $pattern = $null
                        if ($document.Current.IsOffscreen -or !$document.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern,[ref]$pattern)) { continue }
                        $body = $pattern.DocumentRange.GetText(32001)
                        if ($heading) {
                            $start = [regex]::Match($body, $bodyPattern)
                            if (!$start.Success) { continue }
                            $body = $body.Substring($start.Index)
                        }
                        if ($body.Length -gt $best.Length -and ($body -split '\s+').Count -ge 25) { $best = $body }
                    }
                }
                if ($best) {
                    $after = Get-VerifiedTabAddress $item.window $expectedUrl $heading
                    if (!$after -or $after.AbsoluteUri -cne $uri.AbsoluteUri -or !$item.selection.Current.IsSelected -or
                        ($heading -and $item.tab.Current.Name -notmatch $titlePattern)) { throw 'requested_tab_changed' }
                    $title = ($item.tab.Current.Name -split '\s+[\u2013\u2014-]\s+(?:Minnesanv.ndning|Memory usage)')[0]
                    return @{ok=$true;title=$title;host=$uri.IdnHost;text=$best.Substring(0,[Math]::Min(24000,$best.Length)).Trim();truncated=($best.Length -gt 24000)}
                }
            } while ($switched -and [DateTime]::UtcNow -lt $deadline)
            if (!$uri) { throw 'tab_not_found' }
            throw 'lesson_text_missing'
        } catch {
            if ($switched -and $item.prior -and $item.selection.Current.IsSelected) { $item.prior.Select() }
            throw
        }
    }

    if ($action -eq 'read_named_tab') {
        $result = Read-NamedTab
    }
    elseif ($action -eq 'inspect_app') {
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
    elseif ($action -in @('read_window', 'read_desktop_window', 'verify_url', 'find_page_link')) {
        if ($action -ne 'verify_url' -and $request.allowReadContent -ne $true) {
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

        $boundPage = $request.expectedSite -eq 'chatgpt' -or !!$request.expectedUrl
        if ($boundPage -and !(Test-PageAddress $window)) { throw 'expected_page_not_active' }
        if ($action -eq 'verify_url') {
            if (!$request.expectedUrl) { throw 'expected_url_missing' }
            [Console]::Out.WriteLine('{"ok":true,"action":"verify_url"}')
            exit
        }
        if ($action -eq 'find_page_link') {
            $condition = New-Object System.Windows.Automation.PropertyCondition(
                [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
                [System.Windows.Automation.ControlType]::Hyperlink)
            $links = New-Object 'System.Collections.Generic.HashSet[string]'
            foreach ($link in $window.FindAll([System.Windows.Automation.TreeScope]::Descendants,$condition)) {
                if ($link.Current.IsOffscreen -or $link.Current.Name.Trim() -ne ([string]$request.label).Trim()) { continue }
                $walker = [System.Windows.Automation.TreeWalker]::ControlViewWalker
                $parent = $walker.GetParent($link)
                while ($parent -and !$parent.Equals($window) -and $parent.Current.ControlType -ne [System.Windows.Automation.ControlType]::Document) {
                    $parent = $walker.GetParent($parent)
                }
                if (!$parent -or $parent.Current.ControlType -ne [System.Windows.Automation.ControlType]::Document) { continue }
                $pattern = $null
                if ($link.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern,[ref]$pattern)) {
                    $href = [string]$pattern.Current.Value
                    if ($href -match '^https?://') { [void]$links.Add($href) }
                }
            }
            if ($boundPage -and !(Test-PageAddress $window)) { throw 'expected_page_not_active' }
            if ($links.Count -ne 1) { throw 'no_unique_page_link' }
            [Console]::Out.WriteLine((ConvertTo-Json -Compress @{ok=$true;url=@($links)[0]}))
            exit
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
        if ($boundPage -and !(Test-PageAddress $window)) { throw 'expected_page_not_active' }
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
