# Control Spotify's own Windows media session, even when Nova has focus.
param([Parameter(Mandatory)][ValidateSet('play', 'pause')][string]$Action)
$ErrorActionPreference = 'Stop'
try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $managerType = [Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager,Windows.Media.Control,ContentType=WindowsRuntime]
    $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
        $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and
        $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1'
    } | Select-Object -First 1

    function Wait-Operation($operation, [Type]$resultType) {
        $task = $asTask.MakeGenericMethod($resultType).Invoke($null, @($operation))
        if (-not $task.Wait(2500)) { throw 'Windows media timeout' }
        $task.GetAwaiter().GetResult()
    }

    $manager = Wait-Operation ($managerType::RequestAsync()) $managerType
    $sources = @('SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify', 'Spotify.exe', 'Spotify')
    $deadline = [DateTime]::UtcNow.AddSeconds(5)
    $launchChecked = $false
    do {
        $sessions = @($manager.GetSessions() | Where-Object { $_.SourceAppUserModelId -in $sources })
        if ($sessions.Count -gt 1) { exit 2 }
        if ($sessions.Count -eq 1) { break }
        if ($Action -eq 'pause') { exit 2 }
        if (-not $launchChecked) {
            $launchChecked = $true
            $app = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\Spotify.exe'
            if (-not (Get-Process -Name Spotify -ErrorAction SilentlyContinue) -and (Test-Path -LiteralPath $app)) {
                Start-Process -FilePath $app
            }
        }
        Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $deadline)
    if ($sessions.Count -ne 1) { exit 2 }

    $session = $sessions[0]
    $desired = if ($Action -eq 'play') { 'Playing' } else { 'Paused' }
    $info = $session.GetPlaybackInfo()
    if ($info.PlaybackStatus.ToString() -eq $desired) { exit 0 }
    if ($Action -eq 'play') {
        if (-not $info.Controls.IsPlayEnabled) { exit 3 }
        $operation = $session.TryPlayAsync()
    } else {
        if (-not $info.Controls.IsPauseEnabled) { exit 3 }
        $operation = $session.TryPauseAsync()
    }
    if (-not (Wait-Operation $operation ([bool]))) { exit 3 }
    $deadline = [DateTime]::UtcNow.AddSeconds(3)
    do {
        if ($session.GetPlaybackInfo().PlaybackStatus.ToString() -eq $desired) { exit 0 }
        Start-Sleep -Milliseconds 120
    } while ([DateTime]::UtcNow -lt $deadline)
    exit 4
} catch {
    exit 5
}
