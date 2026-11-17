@echo off
chcp 65001 >nul
REM ============================================================
REM 墨韵诗心 · 一键恢复脚本（在别人电脑上双击运行）
REM 功能：建库 → 导入数据 → 装依赖 → 生成 Prisma → 启动
REM 前置：已安装 Node.js 18+、MySQL 8、Python 3.10+
REM ============================================================

setlocal enabledelayedexpansion
cd /d "%~dp0"

echo.
echo ========================================
echo   墨韵诗心 · 环境初始化
echo ========================================
echo.

REM ---- 1. 检查 .env ----
if not exist ".env" (
    echo [错误] 缺少 .env 文件
    echo   请复制 .env.example 为 .env 并填入真实值（至少 ZHIPUAI_API_KEY、MYSQL_*）
    pause
    exit /b 1
)

REM ---- 2. 从 .env 读取 MySQL 配置 ----
for /f "tokens=1,2 delims==" %%a in ('type .env ^| findstr /b "MYSQL_"') do set %%a=%%b
if "%MYSQL_USER%"=="" set MYSQL_USER=root
if "%MYSQL_HOST%"=="" set MYSQL_HOST=127.0.0.1
if "%MYSQL_PORT%"=="" set MYSQL_PORT=3306
if "%MYSQL_DATABASE%"=="" set MYSQL_DATABASE=ai_poetry

REM ---- 3. 检查 MySQL 数据文件 ----
if not exist "data\ai_poetry.sql" (
    echo [错误] 缺少 data\ai_poetry.sql，请确认压缩包完整
    pause
    exit /b 1
)

echo [1/6] 创建数据库 %MYSQL_DATABASE% ...
mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% -e "CREATE DATABASE IF NOT EXISTS %MYSQL_DATABASE% DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>nul
if errorlevel 1 (
    echo   [提示] 若密码错误，请编辑 .env 修改 MYSQL_PASSWORD
    pause
    exit /b 1
)
echo       数据库已就绪

echo [2/6] 导入诗词数据（约 1.8GB，需 2-5 分钟）...
mysql -h %MYSQL_HOST% -P %MYSQL_PORT% -u %MYSQL_USER% -p%MYSQL_PASSWORD% %MYSQL_DATABASE% < data\ai_poetry.sql
if errorlevel 1 (
    echo [错误] 数据导入失败
    pause
    exit /b 1
)
echo       数据导入完成

echo [3/6] 安装 Node 依赖（首次约 3-5 分钟）...
call npm install
if errorlevel 1 (
    echo [错误] npm install 失败，请确认 Node.js 已安装
    pause
    exit /b 1
)

echo [4/6] 生成 Prisma 客户端 ...
call npx prisma generate
if errorlevel 1 (
    echo [错误] prisma generate 失败
    pause
    exit /b 1
)

echo [5/6] 安装本地 AI 服务依赖（需 Python 3.10+，可跳过）...
where python >nul 2>&1
if errorlevel 1 (
    echo   [跳过] 未检测到 Python：语音识别、语音合成、向量精排将不可用
    echo          主站与云模型功能不受影响，检索自动降级为关键词匹配
) else (
    python -m pip install -r requirements.txt -q
    if errorlevel 1 (
        echo   [提示] 依赖安装失败，可手动执行：pip install -r requirements.txt
    ) else (
        echo       本地 AI 依赖已就绪
        echo       [说明] 首次启动会自动下载模型（约 1.7GB），需联网
    )
)

echo.
echo [6/6] 初始化完成！
echo ========================================
echo   启动方式：
echo     python run.py
echo   浏览器访问：http://127.0.0.1:3000
echo ========================================
echo.
pause
