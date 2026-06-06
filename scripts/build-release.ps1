Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Require-Command {
  param([string]$Name)

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

Require-Command "node"
Require-Command "npm"
Require-Command "cargo"

npm install
npm run tauri:build

$bundleDir = Join-Path $PSScriptRoot "..\src-tauri\target\release\bundle"
Write-Host ""
Write-Host "Release bundles:"
Get-ChildItem $bundleDir -Recurse -File | Where-Object {
  $_.Extension -in ".exe", ".msi"
} | Select-Object FullName, Length
