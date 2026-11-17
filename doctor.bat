@echo off
chcp 65001 >nul
cd /d "%~dp0"

echo ========================================
echo   墨韵诗心 · 环境自检与修复
echo ========================================
echo.

where python >nul 2>&1
if errorlevel 1 (
    echo [错误] 未检测到 Python，请先安装 Python 3.10+ 并勾选 Add to PATH
    pause
    exit /b 1
)

python -X utf8 run.py --doctor
echo.
pause
