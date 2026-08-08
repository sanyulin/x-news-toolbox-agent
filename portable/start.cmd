@echo off
setlocal
cd /d "%~dp0"
if not defined PORT set PORT=3000
set HOSTNAME=0.0.0.0
set CREATOR_MIND_PORTABLE=1
set CREATOR_MIND_DATABASE_PATH=%~dp0data\x-news-toolbox.sqlite
set CREATOR_MIND_RUNTIME_CONFIG_PATH=%~dp0data\runtime-config.json
start "" "http://localhost:%PORT%"
node.exe server.js
if errorlevel 1 (
  echo.
  echo 启动失败。请确认端口 %PORT% 未被占用，并保留此窗口截图。
  pause
)
endlocal
