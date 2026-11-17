@echo off
rem 一键启动：本地微服务（向量 8100 / 语音识别 8101 / 语音合成 8102）+ Next.js 开发服务器
rem 幂等：服务已在运行则跳过；用法：双击运行，或在项目目录执行 scripts\start_all.bat
chcp 65001 >nul
cd /d "%~dp0.."

rem ---- [前置] MySQL 端口检查 ----
powershell -NoProfile -Command "if(-not (Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue)){ Write-Host '⚠ MySQL 3306 未监听，请先启动 MySQL 服务' -ForegroundColor Yellow }"

rem ---- [1/2] 本地 Python 微服务：已就绪则跳过 ----
call :ensure_service "BGE 向量服务" 8100 "scripts\embed_server.py"
call :ensure_service "语音识别服务" 8101 "scripts\asr_server.py"
call :ensure_service "语音合成服务" 8102 "scripts\tts_server.py"

rem ---- [2/2] Next.js ----
echo [2/2] 启动 Next.js 开发服务器 ^(端口 3000^)...
call npm run dev
exit /b 0

:ensure_service
setlocal
set "NAME=%~1"
set "PORT=%~2"
set "SCRIPT=%~3"
powershell -NoProfile -Command "try { Invoke-RestMethod http://127.0.0.1:%PORT%/health -TimeoutSec 3 | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo 启动%NAME% ^(端口 %PORT%^)...
  start "%NAME%" /min cmd /c "python %SCRIPT%"
  powershell -NoProfile -Command "$ok=$false; for($i=0;$i -lt 30;$i++){ try { Invoke-RestMethod http://127.0.0.1:%PORT%/health -TimeoutSec 2 | Out-Null; $ok=$true; break } catch { Start-Sleep -Seconds 2 } }; if($ok){ Write-Host '✓ %NAME% 已就绪' -ForegroundColor Green } else { Write-Host '⚠ %NAME% 60 秒内未就绪，相关功能自动降级' -ForegroundColor Yellow }"
) else (
  echo %NAME% 已在运行，跳过启动
)
endlocal
exit /b 0
