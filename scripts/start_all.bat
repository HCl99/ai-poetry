@echo off
rem 一键启动：本地向量服务 + Next.js 开发服务器
rem 用法：双击运行，或在项目目录执行 scripts\start_all.bat
chcp 65001 >nul
cd /d "%~dp0.."

echo [1/2] 启动 BGE 向量微服务 (端口 8100)...
start "embed-server" /min cmd /c "python scripts\embed_server.py"

echo [2/2] 启动 Next.js 开发服务器 (端口 3000)...
call npm run dev
