@echo off
setlocal

cd /d "%~dp0"
set "PREVIEW_URL=http://127.0.0.1:8788/"

echo Starting Aarhus Gamestormers local preview...
echo.
echo This runs the Cloudflare Pages dev server so CSS and /api/* routes work.
echo Keep this window open while previewing. Press Ctrl+C to stop the server.
echo.

start "" /min powershell.exe -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 5; Start-Process '%PREVIEW_URL%'"

call npm.cmd run dev

echo.
echo Preview server stopped.
pause
