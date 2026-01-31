#!/usr/bin/env pwsh
# CC Helper - Quick Setup for PowerShell
# This script runs the setup wizard

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CC Helper - Quick Setup" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
node "$scriptPath\setup.js"

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Setup failed. Please check the error messages above." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}

Read-Host "Press Enter to exit"
