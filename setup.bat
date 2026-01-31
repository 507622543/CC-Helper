@echo off
REM CC Helper - Quick Setup for Windows CMD
REM This script runs the setup wizard

echo ========================================
echo CC Helper - Quick Setup
echo ========================================
echo.

node "%~dp0setup.js"

if %errorlevel% neq 0 (
    echo.
    echo Setup failed. Please check the error messages above.
    pause
    exit /b 1
)

pause
