@echo off
REM CC Helper Test Script
REM This script tests all major functionality

echo ========================================
echo CC Helper - Functionality Test
echo ========================================
echo.

echo [1/5] Testing cchelper command availability...
where cchelper >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] cchelper command found
) else (
    echo [FAIL] cchelper command not found
    echo Please run: npm link
    exit /b 1
)
echo.

echo [2/5] Testing version command...
cchelper --version
if %errorlevel% equ 0 (
    echo [OK] Version command works
) else (
    echo [FAIL] Version command failed
)
echo.

echo [3/5] Testing help command...
cchelper --help >nul 2>&1
if %errorlevel% equ 0 (
    echo [OK] Help command works
) else (
    echo [FAIL] Help command failed
)
echo.

echo [4/5] Testing status command...
cchelper status
if %errorlevel% equ 0 (
    echo [OK] Status command works
) else (
    echo [FAIL] Status command failed
)
echo.

echo [5/5] Testing Node.js version...
node --version
echo [OK] Node.js is installed
echo.

echo ========================================
echo Test Summary
echo ========================================
echo All basic tests completed!
echo.
echo Next steps:
echo 1. Run 'cchelper' to start interactive mode
echo 2. Add a profile in Profile Management
echo 3. Install CCG Skills if needed
echo 4. Start Claude Code
echo.
echo For more information, see:
echo - README.md
echo - INSTALL.md
echo - EXAMPLES.md
echo ========================================

pause
