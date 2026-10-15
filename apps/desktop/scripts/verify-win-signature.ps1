param(
  [Parameter(Mandatory = $true)][string]$Path,
  [Parameter(Mandatory = $true)][string]$Publisher
)
$ErrorActionPreference = 'Stop'
$signature = Get-AuthenticodeSignature -LiteralPath $Path
if ($signature.Status -ne 'Valid' -or $null -eq $signature.SignerCertificate -or $null -eq $signature.TimeStamperCertificate) {
  throw "Valid timestamped Authenticode signature required: $Path"
}
$name = $signature.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
if ($name -cne $Publisher) { throw "Authenticode publisher does not match configured publisher: $Path" }
Write-Output "Verified timestamped Authenticode signature: $Path"
