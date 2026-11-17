@echo off
chcp 65001 >nul
REM ============================================================
REM 墨韵诗心 · 打包脚本（生成可分享的压缩包）
REM 排除：node_modules、.next、.git、缓存、运行期产物
REM 包含：源码、MySQL 数据、向量缓存、setup.bat
REM 安全：绝不打包 .env（含智谱 Key / 邮件授权码 / AUTH_SECRET / 数据库口令），只保留 .env.example 模板
REM ============================================================

cd /d "%~dp0"
set OUT=..\墨韵诗心.zip

echo 正在生成压缩包：%OUT%
echo （含数据库 1.8GB + 向量 672MB，压缩需 3-8 分钟）
echo.

tar -a -c -f "%OUT%" ^
  --exclude=node_modules ^
  --exclude=.env ^
  --exclude=*/.env ^
  --exclude=.next ^
  --exclude=.git ^
  --exclude=__pycache__ ^
  --exclude=*.pyc ^
  --exclude=data/_shots ^
  --exclude=public/creations ^
  --exclude=tsconfig.tsbuildinfo ^
  .

if errorlevel 1 (
    echo.
    echo [错误] 打包失败
    pause
    exit /b 1
)

echo.
echo ========================================
echo   打包完成：%OUT%
echo ========================================
echo.
echo 对方收到后：
echo   1. 解压到任意目录
echo   2. 双击 setup.bat 初始化
echo   3. python run.py 启动
echo.
pause
