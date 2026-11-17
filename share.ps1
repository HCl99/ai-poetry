﻿# 墨韵诗心 · 公网演示一键启动（带自愈）
# 1) 建立 Cloudflare 隧道并自动把地址写进 .env 的 AUTH_URL
# 2) 重启 3001 并做公网自检
# 3) 常驻保活：地址被 Cloudflare 回收时自动重建隧道、同步新地址、重启主站
# 用法：双击 share.bat

$ErrorActionPreference = 'Stop'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$Root    = $PSScriptRoot
Set-Location $Root
$Port    = 3001
$LogDir  = Join-Path $Root '.share'
$EnvPath = Join-Path $Root '.env'
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

function Die($m) {
  Write-Host ''
  Write-Host "[失败] $m" -ForegroundColor Red
  Read-Host '按回车退出'
  exit 1
}
function Kill-Tree($target) {
  if (-not $target) { return }
  try { & taskkill /PID $target /T /F *> $null } catch {}
}

function Find-Cloudflared {
  foreach ($p in @(
    (Join-Path $Root 'tools\cloudflared.exe'),
    (Join-Path (Split-Path -Parent $Root) 'tools\cloudflared.exe')
  )) { if (Test-Path $p) { return $p } }
  $cmd = Get-Command cloudflared -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }

  Write-Host '  未找到 cloudflared，正在下载（约 53MB，仅首次）...'
  $dir = Join-Path $Root 'tools'
  New-Item -ItemType Directory -Force -Path $dir | Out-Null
  $out = Join-Path $dir 'cloudflared.exe'
  Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' `
    -OutFile $out -UseBasicParsing -TimeoutSec 300
  return $out
}

# 建立新隧道，返回 @{ Proc; Url }；失败返回 $null
function Start-Tunnel($cf) {
  Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 1

  $log = Join-Path $LogDir 'tunnel.log'
  $out = Join-Path $LogDir 'tunnel.out.log'
  Remove-Item $log, $out -Force -ErrorAction SilentlyContinue

  $proc = Start-Process -FilePath $cf `
    -ArgumentList 'tunnel', '--url', "http://localhost:$Port", '--no-autoupdate' `
    -RedirectStandardError $log -RedirectStandardOutput $out `
    -NoNewWindow -PassThru

  for ($i = 0; $i -lt 90; $i++) {
    Start-Sleep -Milliseconds 1000
    if (Test-Path $log) {
      $hit = Select-String -Path $log -Pattern 'https://[a-z0-9-]+\.trycloudflare\.com' `
             -ErrorAction SilentlyContinue | Select-Object -First 1
      if ($hit) { return @{ Proc = $proc; Url = $hit.Matches[0].Value } }
    }
    if ($proc.HasExited) { break }
  }
  Kill-Tree $proc.Id
  return $null
}

# 写入 AUTH_URL，并回读校验，写坏就中止而不是留空值
function Sync-Env($url) {
  if (-not $url -or $url -notmatch '^https://[a-z0-9.-]+$') {
    Die '公网地址无效，已中止（.env 未改动）'
  }
  if (-not (Test-Path $EnvPath)) { Die '缺少 .env，请先复制 .env.example 为 .env' }

  $text = Get-Content $EnvPath -Raw -Encoding UTF8
  if ($text -match '(?m)^AUTH_URL=') {
    $text = [regex]::Replace($text, '(?m)^AUTH_URL=.*$', "AUTH_URL=$url")
  } else {
    $text = $text.TrimEnd() + "`r`nAUTH_URL=$url`r`n"
  }
  [System.IO.File]::WriteAllText($EnvPath, $text, (New-Object System.Text.UTF8Encoding($false)))

  $check = Select-String -Path $EnvPath -Pattern '^AUTH_URL=(\S+)' -ErrorAction SilentlyContinue
  if (-not $check -or $check.Matches[0].Groups[1].Value -ne $url) {
    Die '.env 写入校验失败，请检查文件权限'
  }
}

# 重启 3001，返回进程对象
function Restart-Site {
  $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if ($listeners) {
    $listeners.OwningProcess | Select-Object -Unique | ForEach-Object { Kill-Tree $_ }
    Start-Sleep -Seconds 2
  }
  if (-not (Test-Path (Join-Path $Root '.next\BUILD_ID'))) {
    Write-Host '  未发现生产构建，正在编译（约 2 分钟）...'
    & cmd /c 'npm run build' | Out-Null
    if ($LASTEXITCODE -ne 0) { Die '构建失败，请查看上方输出' }
  }
  $proc = Start-Process -FilePath 'cmd.exe' `
    -ArgumentList '/c', "npm run start -- -p $Port" `
    -WorkingDirectory $Root -WindowStyle Minimized -PassThru

  for ($i = 0; $i -lt 60; $i++) {
    Start-Sleep -Seconds 2
    try {
      $r = Invoke-WebRequest -Uri "http://localhost:$Port/login" -UseBasicParsing -TimeoutSec 5
      if ($r.StatusCode -eq 200) { return $proc }
    } catch {}
  }
  Kill-Tree $proc.Id
  Die '主站 120 秒内未就绪'
}

function Test-Public($url) {
  try {
    $r = Invoke-WebRequest -Uri "$url/login" -UseBasicParsing -TimeoutSec 20
    return ($r.StatusCode -eq 200)
  } catch { return $false }
}

function Show-Address($url, $publicOk) {
  Write-Host ''
  Write-Host '========================================' -ForegroundColor Cyan
  Write-Host '  公网地址：' -NoNewline
  Write-Host $url -ForegroundColor Green
  Write-Host '  评审账号：test@poetry.ai / test123456'
  Write-Host ('  公网自检：' + $(if ($publicOk) { '通过' } else { '本地就绪，公网首访可能需 10-30 秒' }))
  Write-Host '========================================' -ForegroundColor Cyan
  Write-Host ''
}

Write-Host '========================================'
Write-Host '  墨韵诗心 · 公网演示'
Write-Host '========================================'
Write-Host ''

Write-Host '[1/3] 准备 cloudflared ...'
$cf = Find-Cloudflared
Write-Host '      ✓'

Write-Host '[2/3] 建立隧道并同步 AUTH_URL ...'
$t = Start-Tunnel $cf
if (-not $t) { Die '隧道建立失败，请检查网络或代理设置' }
Sync-Env $t.Url
Write-Host "      ✓ $($t.Url)"

Write-Host '[3/3] 重启主站 ...'
$site = Restart-Site
Write-Host '      ✓'

Start-Sleep -Seconds 3
Show-Address $t.Url (Test-Public $t.Url)
Write-Host '保持此窗口开启。地址失效会自动重建，按 Ctrl+C 结束。' -ForegroundColor DarkGray
Write-Host ''

$failCount = 0
try {
  while ($true) {
    Start-Sleep -Seconds 45

    $alive = (-not $t.Proc.HasExited) -and (Test-Public $t.Url)
    if ($alive) { $failCount = 0; continue }

    $failCount++
    if ($failCount -lt 2) { continue }

    Write-Host '[恢复] 公网地址已失效，正在重建隧道...' -ForegroundColor Yellow
    $t = Start-Tunnel $cf
    if (-not $t) {
      Write-Host '[恢复] 重建失败，稍后重试' -ForegroundColor Red
      $failCount = 0
      continue
    }
    Sync-Env $t.Url
    $site = Restart-Site
    $failCount = 0
    Show-Address $t.Url (Test-Public $t.Url)
  }
} finally {
  Write-Host ''
  Write-Host '正在关闭隧道与主站...'
  Kill-Tree $site.Id
  Kill-Tree $t.Proc.Id
  Write-Host '已退出'
}
