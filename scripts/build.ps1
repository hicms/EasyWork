<#
.SYNOPSIS
Build a Windows x64 application directory that runs directly without installation.
.EXAMPLE
.\scripts\build.ps1
.EXAMPLE
.\scripts\build.ps1 -Target installer -SkipInstall
#>
param(
    [ValidateSet('dir', 'installer')]
    [string] $Target = 'dir',
    [switch] $SkipInstall,
    [switch] $Help
)
Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$entry = Join-Path $PSScriptRoot 'local-workflow.mjs'
$workflowArgs = @($entry, 'build-win', "--target=$Target")
if ($SkipInstall) { $workflowArgs += '--skip-install' }
if ($Help) { $workflowArgs = @($entry, '--help') }
& node @workflowArgs
exit $LASTEXITCODE
