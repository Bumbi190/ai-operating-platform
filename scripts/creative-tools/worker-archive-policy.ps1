#Requires -Version 5.1
<# Pure archive entry allowlist, shared by real ZIP audit and synthetic hostile tests. #>
function Test-CreativeZipEntries {
  [CmdletBinding()]
  param(
    [object[]]$Entries,
    [ValidateSet('photocraft','filmcraft')][string]$Program,
    [string]$Version
  )
  if ($Version -notmatch '^\d+\.\d+\.\d+$' -or @($Entries).Count -ne 9) { return $false }
  $prefix="$Program-$Version-windows-x64-portable/"
  $allow=@(
    'LICENSE-APACHE','LICENSE-MIT','OFL-biz-ud-mincho.txt',
    'OFL-biz-ud-pgothic.txt','OFL-shippori-mincho.txt',
    "$Program-cli.exe","$Program.exe",'portable.txt','README.md'
  ) | ForEach-Object {"$prefix$_"}
  $seen=New-Object 'System.Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase)
  $total=0L
  foreach ($file in $Entries) {
    if ($null -eq $file) { return $false }
    $path=[string]$file.FullName
    # Exact flat filenames; no traversal, ADS, backslash, absolute path,
    # duplicate alias or nested entry can pass this allowlist.
    if ($allow -cnotcontains $path -or -not $seen.Add($path)) { return $false }
    if ([long]$file.ExternalAttributes -ne 0L) { return $false }
    $size=[long]$file.Length
    $compressed=[long]$file.CompressedLength
    if ($size -le 0 -or $size -gt 128MB -or
        $compressed -le 0 -or ($size / $compressed) -gt 30) { return $false }
    $total += $size
    if ($total -gt 230MB) { return $false }
  }
  return ($seen.Count -eq 9)
}
