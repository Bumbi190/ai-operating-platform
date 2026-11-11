# Read plain UTF-8 text from stdin, never evaluate it as SSML or PowerShell.
$ErrorActionPreference = 'Stop'
[Console]::InputEncoding = [Text.UTF8Encoding]::new($false)
try {
    $voice = New-Object -ComObject SAPI.SpVoice
    $category = New-Object -ComObject SAPI.SpObjectTokenCategory
    $category.SetId('HKEY_LOCAL_MACHINE\SOFTWARE\Microsoft\Speech_OneCore\Voices', $false)
    $token = $category.EnumerateTokens() | Where-Object {
        $_.GetAttribute('Language') -match '^(?:0?41[dD])(?:;|$)' -and $_.GetDescription() -match '\bBengt\b'
    } | Select-Object -First 1
    if (!$token) { exit 3 }
    $voice.Voice = $token
    $text = [Console]::In.ReadToEnd().Trim()
    if (!$text -or $text.Length -gt 700) { exit 2 }
    $null = $voice.Speak($text, 16)
    exit 0
} catch { exit 4 }
