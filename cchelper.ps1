#!/usr/bin/env pwsh
# CC Helper Launcher for PowerShell
# This script ensures cchelper runs correctly in PowerShell

$scriptPath = Split-Path -Parent $MyInvocation.MyCommand.Path
node "$scriptPath\index.js" $args
