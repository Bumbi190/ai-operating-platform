param([Parameter(Mandatory=$true)][ValidateSet('Generate','Inspect','Sign','DeleteTest')][string]$Action,[Parameter(Mandatory=$true)][string]$KeyName)
$ErrorActionPreference='Stop'
$key=$null
try {
 if($KeyName -notmatch '^Omnira-Atlas-LocalText-(?:test-)?[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'){throw 'INVALID_IDENTITY_NAME'}
 $provider=[Security.Cryptography.CngProvider]::MicrosoftSoftwareKeyStorageProvider
 if($Action -eq 'Generate'){
  if([Security.Cryptography.CngKey]::Exists($KeyName,$provider)){throw 'IDENTITY_EXISTS'}
  $parameters=[Security.Cryptography.CngKeyCreationParameters]::new()
  $parameters.Provider=$provider
  $parameters.ExportPolicy=[Security.Cryptography.CngExportPolicies]::None
  $parameters.KeyUsage=[Security.Cryptography.CngKeyUsages]::Signing
  $key=[Security.Cryptography.CngKey]::Create([Security.Cryptography.CngAlgorithm]::ECDsaP256,$KeyName,$parameters)
 } else {$key=[Security.Cryptography.CngKey]::Open($KeyName,$provider)}
 if($key.IsMachineKey -or $key.ExportPolicy -ne [Security.Cryptography.CngExportPolicies]::None -or $key.AlgorithmGroup -ne [Security.Cryptography.CngAlgorithmGroup]::ECDsa){throw 'IDENTITY_UNPROTECTED'}
 if($Action -eq 'DeleteTest'){
  if($KeyName -notmatch '^Omnira-Atlas-LocalText-test-'){throw 'TEST_IDENTITY_REQUIRED'}
  $key.Delete();@{deleted=$true}|ConvertTo-Json -Compress;exit 0
 }
 if($Action -eq 'Sign'){
  $text=[Console]::In.ReadToEnd();if($text.Length -gt 8192){throw 'INVALID_SIGNATURE_INPUT'}
  $inputValue=$text|ConvertFrom-Json
  if(@($inputValue.PSObject.Properties).Count -ne 1 -or $null -eq $inputValue.payloadBase64 -or $inputValue.payloadBase64 -isnot [string]){throw 'INVALID_SIGNATURE_INPUT'}
  $payload=[Convert]::FromBase64String($inputValue.payloadBase64);if($payload.Length -gt 4096){throw 'INVALID_SIGNATURE_INPUT'}
  $hashAlgorithm=[Security.Cryptography.SHA256]::Create()
  $signer=[Security.Cryptography.ECDsaCng]::new($key)
  try {$signature=$signer.SignHash($hashAlgorithm.ComputeHash($payload))}finally{$signer.Dispose();$hashAlgorithm.Dispose()}
  if($signature.Length -ne 64){throw 'INVALID_SIGNATURE_ENCODING'}
  @{signature=[Convert]::ToBase64String($signature).TrimEnd('=').Replace('+','-').Replace('/','_')}|ConvertTo-Json -Compress
 }else{
  $blob=$key.Export([Security.Cryptography.CngKeyBlobFormat]::EccPublicBlob)
  if($blob.Length -ne 72 -or [BitConverter]::ToUInt32($blob,0) -ne 0x31534345 -or [BitConverter]::ToUInt32($blob,4) -ne 32){throw 'INVALID_PUBLIC_KEY'}
  $x=New-Object byte[] 32;$y=New-Object byte[] 32
  [Array]::Copy($blob,8,$x,0,32);[Array]::Copy($blob,40,$y,0,32)
  $public=@{kty='EC';crv='P-256';x=[Convert]::ToBase64String($x).TrimEnd('=').Replace('+','-').Replace('/','_');y=[Convert]::ToBase64String($y).TrimEnd('=').Replace('+','-').Replace('/','_')}
  $denied=$false
  if($Action -eq 'Inspect'){
   try {$private=$key.Export([Security.Cryptography.CngKeyBlobFormat]::EccPrivateBlob);[Array]::Clear($private,0,$private.Length)}catch [Security.Cryptography.CryptographicException] {$denied=$true}
  }
  @{publicJwk=$public;machineKey=$key.IsMachineKey;exportPolicy=$key.ExportPolicy.ToString();privateExportDenied=$denied}|ConvertTo-Json -Depth 5 -Compress
 }
}catch{[Console]::Error.WriteLine('LOCAL_IDENTITY_UNAVAILABLE');exit 1}finally{if($null -ne $key){$key.Dispose()}}
