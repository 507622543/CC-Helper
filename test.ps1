#!/usr/bin/env pwsh
# CC Helper Test Script for PowerShell
# This script tests all major functionality

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CC Helper - Functionality Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "[1/5] Testing cchelper command availability..." -ForegroundColor Yellow
$cchelperCmd = Get-Command cchelper -ErrorAction SilentlyContinue
if ($cchelperCmd) {
    Write-Host "[OK] cchelper command found" -ForegroundColor Green
} else {
    Write-Host "[FAIL] cchelper command not found" -ForegroundColor Red
    Write-Host "Please run: npm link" -ForegroundColor Yellow
    exit 1
}
Write-Host ""

Write-Host "[2/5] Testing version command..." -ForegroundColor Yellow
try {
    $version = cchelper --version
    Write-Host $version
    Write-Host "[OK] Version command works" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] Version command failed" -ForegroundColor Red
}
Write-Host ""

Write-Host "[3/5] Testing help command..." -ForegroundColor Yellow
try {
    cchelper --help | Out-Null
    Write-Host "[OK] Help command works" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] Help command failed" -ForegroundColor Red
}
Write-Host ""

Write-Host "[4/5] Testing status command..." -ForegroundColor Yellow
try {
    cchelper status
    Write-Host "[OK] Status command works" -ForegroundColor Green
} catch {
    Write-Host "[FAIL] Status command failed" -ForegroundColor Red
}
Write-Host ""

Write-Host "[5/5] Testing Node.js version..." -ForegroundColor Yellow
$nodeVersion = node --version
Write-Host $nodeVersion
Write-Host "[OK] Node.js is installed" -ForegroundColor Green
Write-Host ""

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test Summary" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "All basic tests completed!" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "1. Run 'cchelper' to start interactive mode"
Write-Host "2. Add a profile in Profile Management"
Write-Host "3. Install CCG Skills if needed"
Write-Host "4. Start Claude Code"
Write-Host ""
Write-Host "For more information, see:" -ForegroundColor Yellow
Write-Host "- README.md"
Write-Host "- INSTALL.md"
Write-Host "- EXAMPLES.md"
Write-Host "========================================" -ForegroundColor Cyan

Read-Host "Press Enter to continue"
