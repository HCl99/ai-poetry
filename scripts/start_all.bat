@echo off
rem 一键启动：本地向量服务 + Next.js 开发服务器（幂等：向量服务已在运行则不重复启动）
rem 用法：双击运行，或在项目目录执行 scripts\start_all.bat
chcp 65001 >nul
cd /d "%~dp0.."

rem ---- [前置] MySQL 端口检查 ----
powershell -NoProfile -Command "if(-not (Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue)){ Write-Host '⚠ MySQL 3306 未监听，请先启动 MySQL 服务' -ForegroundColor Yellow }"

rem ---- [1/2] BGE 向量服务：已就绪则跳过 ----
powershell -NoProfile -Command "try { Invoke-RestMethod http://127.0.0.1:8100/health -TimeoutSec 3 | Out-Null; exit 0 } catch { exit 1 }"
if errorlevel 1 (
  echo [1/2] 启动 BGE 向量微服务 ^(端口 8100^)...
  start "embed-server" /min cmd /c "python scripts\embed_server.py"
  powershell -NoProfile -Command "$ok=$false; for($i=0;$i -lt 30;$i++){ try { Invoke-RestMethod http://127.0.0.1:8100/health -TimeoutSec 2 | Out-Null; $ok=$true; break } catch { Start-Sleep -Seconds 2 } }; if($ok){ Write-Host '✓ BGE 服务已就绪' -ForegroundColor Green } else { Write-Host '⚠ BGE 服务 60 秒内未就绪，AI 检索将自动降级为关键词模式' -ForegroundColor Yellow }"
) else (
  echo [1/2] BGE 向量服务已在运行，跳过启动
)

rem ---- [2/2] Next.js ----
echo [2/2] 启动 Next.js 开发服务器 ^(端口 3000^)...
call npm run dev
