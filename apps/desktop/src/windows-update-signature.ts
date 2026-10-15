import { execFile } from 'node:child_process'
import { win32 } from 'node:path'

type SignatureCommand = (command: string) => Promise<string>

export async function runSignatureCommand(command: string): Promise<string> {
  const systemRoot = process.env.SystemRoot
  if (!systemRoot || !win32.isAbsolute(systemRoot)) throw new Error('Windows signature verifier unavailable')
  const executable = win32.join(systemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe')
  // PS 5.1 sends first-use module progress as CLIXML on stderr even on success.
  command = "$ProgressPreference = 'SilentlyContinue'\n$ErrorActionPreference = 'Stop'\n" + command
  return new Promise((resolve, reject) => {
    execFile(executable, ['-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], {
      windowsHide: true, timeout: 30_000, encoding: 'utf8', maxBuffer: 64 * 1024,
      env: { ...process.env, PSModulePath: '' },
    }, (error, stdout, stderr) => {
      if (error || stderr.trim()) reject(new Error('Windows signature verification failed'))
      else resolve(stdout)
    })
  })
}

/** Unlike the upstream fallback, unavailable PowerShell never means a valid signature. */
export async function verifyWindowsUpdateSignature(publishers: string[], path: string, run: SignatureCommand = runSignatureCommand): Promise<string | null> {
  if (!win32.isAbsolute(path) || !publishers.length || publishers.some(name => !name.trim())) return 'Missing trusted publisher or installer path'
  const literalPath = path.replaceAll("'", "''")
  const command = `
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$signature = Get-AuthenticodeSignature -LiteralPath '${literalPath}'
if ($null -eq $signature.SignerCertificate) { throw 'Missing signer certificate' }
@{
  Status = [int]$signature.Status
  Path = $signature.Path
  Publisher = $signature.SignerCertificate.GetNameInfo([System.Security.Cryptography.X509Certificates.X509NameType]::SimpleName, $false)
  Timestamped = $null -ne $signature.TimeStamperCertificate
} | ConvertTo-Json -Compress
`
  try {
    const signature = JSON.parse((await run(command)).replace(/^\uFEFF/u, '').trim()) as Record<string, unknown>
    if (signature.Status !== 0 || signature.Timestamped !== true || typeof signature.Path !== 'string'
      || win32.normalize(signature.Path).toLowerCase() !== win32.normalize(path).toLowerCase()
      || typeof signature.Publisher !== 'string' || !publishers.includes(signature.Publisher)) return 'Installer signature, timestamp, path or publisher is invalid'
    return null
  } catch {
    return 'Windows signature verification could not be completed'
  }
}
