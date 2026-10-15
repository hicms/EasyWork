$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

function Test-EasyWorkTargetIdle([string]$Target, [array]$Processes) {
  if (-not [IO.Path]::IsPathRooted($Target)) { throw 'Missing absolute installation target' }
  $expected = [IO.Path]::GetFullPath($Target)
  foreach ($process in $Processes) {
    if ($process.Name -ine 'EasyWork.exe') { continue }
    if (-not $process.ExecutablePath) { throw 'Cannot determine the owner of an EasyWork process' }
    if ([IO.Path]::GetFullPath($process.ExecutablePath).Equals($expected, [StringComparison]::OrdinalIgnoreCase)) { return $false }
  }
  return $true
}

if ($MyInvocation.InvocationName -ne '.') {
  try {
    # The newly spawned installer can observe the carrier before its natural exit.
    for ($attempt = 0; $attempt -lt 20; $attempt++) {
      $processes = @(Get-CimInstance -ClassName Win32_Process -Filter "Name='EasyWork.exe'" -ErrorAction Stop)
      if (Test-EasyWorkTargetIdle $env:EASYWORK_INSTALL_TARGET $processes) { exit 0 }
      Start-Sleep -Milliseconds 250
    }
    exit 2
  } catch { exit 3 }
}
