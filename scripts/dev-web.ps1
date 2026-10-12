<#
.SYNOPSIS
Build and run only the EasyWork Web preview. Stop with Ctrl+C.
.EXAMPLE
.\scripts\dev-web.ps1
.EXAMPLE
.\scripts\dev-web.ps1 -Port 19000 -SkipSetup
#>
param(
    [ValidateRange(1, 65535)]
    [int] $Port = 18989,
    [switch] $SkipSetup,
    [switch] $Help
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$entry = Join-Path $PSScriptRoot 'local-workflow.mjs'
$workflowArgs = @($entry, 'web', "--port=$Port")
if ($SkipSetup) { $workflowArgs += '--skip-setup' }
if ($Help) { $workflowArgs = @($entry, '--help') }
& node @workflowArgs
exit $LASTEXITCODE
