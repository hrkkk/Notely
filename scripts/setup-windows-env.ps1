Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Require-Admin {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)

  if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Please run this script from an Administrator PowerShell."
  }
}

function Require-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

function Install-WingetPackage {
  param(
    [string]$Id,
    [string]$Name,
    [string]$Override = ""
  )

  Write-Host ""
  Write-Host "==> Installing $Name"

  $args = @(
    "install",
    "--exact",
    "--id",
    $Id,
    "--accept-package-agreements",
    "--accept-source-agreements"
  )

  if ($Override.Length -gt 0) {
    $args += @("--override", $Override)
  }

  winget @args
}

Require-Admin
Require-Command "winget"

Install-WingetPackage -Id "OpenJS.NodeJS.LTS" -Name "Node.js LTS"
Install-WingetPackage -Id "Rustlang.Rustup" -Name "Rustup"
Install-WingetPackage -Id "Microsoft.EdgeWebView2Runtime" -Name "Microsoft Edge WebView2 Runtime"
Install-WingetPackage `
  -Id "Microsoft.VisualStudio.2022.BuildTools" `
  -Name "Visual Studio 2022 Build Tools" `
  -Override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"

$machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
$userPath = [Environment]::GetEnvironmentVariable("Path", "User")
$env:Path = "$machinePath;$userPath"

Write-Host ""
Write-Host "==> Configuring Rust MSVC toolchain"
rustup default stable-msvc

Write-Host ""
Write-Host "==> Environment check"
node --version
npm --version
rustc --version
cargo --version

Write-Host ""
Write-Host "Windows Tauri build environment is ready."
