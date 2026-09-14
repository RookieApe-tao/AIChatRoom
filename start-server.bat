@echo off
chcp 65001 >nul
title Chat Server

set "SERVER=D:\Trae CN\project\pulis\liaotian\server.js"
set "PORT=8765"

rem -- stop previous instance of THIS server, otherwise node fails with EADDRINUSE --
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort %PORT% -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $p = Get-CimInstance Win32_Process -Filter ('ProcessId=' + $_.OwningProcess) -ErrorAction SilentlyContinue; if ($p -and $p.Name -eq 'node.exe' -and $p.CommandLine -like '*liaotian\server.js*') { Stop-Process -Id $p.ProcessId -Force } }"

echo Starting server: %SERVER%
node "%SERVER%"
echo.
echo Server exited (code %errorlevel%). Press any key to close...
pause >nul
