@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   Local AI Services  8100 / 8101 / 8102
echo ========================================
echo.
echo Keep these three windows open while demoing.
echo Close a window to stop that service.
echo.

start "Moyun Embed 8100" cmd /k python scripts\embed_server.py
start "Moyun ASR 8101"   cmd /k python scripts\asr_server.py
start "Moyun TTS 8102"   cmd /k python scripts\tts_server.py

echo Three service windows opened.
timeout /t 5 >nul
