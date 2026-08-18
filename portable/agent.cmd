@echo off
setlocal
cd /d "%~dp0"
"%~dp0node.exe" "%~dp0agent\cli.mjs" %*
exit /b %errorlevel%
