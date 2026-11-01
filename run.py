#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""墨韵诗心 · 一键启动脚本

流程：配置检查 → MySQL 3306 → BGE 向量服务 8100 → Next.js 3000

用法：
    python run.py             # 启动全部（已在运行的组件复用，不重复拉起）
    python run.py --skip-bge  # 只起前端（向量服务在别处运行）

说明：run.py 本身只用标准库；向量服务的解释器会自动挑选（需要 flask +
sentence-transformers），也可用环境变量 EMBED_PYTHON 指定，例如
    set EMBED_PYTHON=C:/Python314/python.exe

Ctrl+C 结束时会关闭本次拉起的子进程。
"""
from __future__ import annotations

import argparse
import os
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser
from pathlib import Path

ROOT = Path(__file__).resolve().parent
WEB_URL = "http://127.0.0.1:3000"
EMBED_URL = "http://127.0.0.1:8100"

# 与 .env.example 里给出的示例值一致，用于提示"忘了改"
PLACEHOLDER_SECRET = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6"


def port_open(port: int, host: str = "127.0.0.1", timeout: float = 1.0) -> bool:
    with socket.socket() as s:
        s.settimeout(timeout)
        return s.connect_ex((host, port)) == 0


def http_ok(url: str, timeout: float = 2.0) -> bool:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return 200 <= r.status < 400
    except Exception:
        return False


def wait_until(ok, seconds: int, label: str) -> bool:
    t0 = time.time()
    while time.time() - t0 < seconds:
        if ok():
            return True
        time.sleep(1.5)
    print(f"      ! {label} 在 {seconds}s 内未就绪")
    return False


def load_env() -> dict:
    env_path = ROOT / ".env"
    if not env_path.exists():
        print("[错误] 缺少 .env，请先执行：copy .env.example .env 并填写真实值")
        sys.exit(1)
    conf: dict[str, str] = {}
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        conf[k.strip()] = v.strip()
    return conf


def check_config(conf: dict) -> None:
    """只提示、不阻断：缺密钥时系统仍能起，对应功能不可用。"""
    warns = []
    secret = conf.get("AUTH_SECRET", "")
    if not secret or secret.startswith("please_generate") or secret == PLACEHOLDER_SECRET:
        warns.append("AUTH_SECRET 仍是示例值，会话可被伪造（用 openssl rand -base64 32 重生成）")
    if not conf.get("ZHIPUAI_API_KEY"):
        warns.append("ZHIPUAI_API_KEY 为空：所有 AI 功能不可用")
    if not conf.get("SMTP_USER") or not conf.get("SMTP_PASS"):
        warns.append("SMTP 未配置：注册与找回密码无法发送验证码")
    if not conf.get("MCP_API_KEY"):
        warns.append("MCP_API_KEY 为空：外部 Agent 无法用 Bearer 调用 /api/mcp")
    for w in warns:
        print(f"      [提示] {w}")


def can_run_embed(py: str) -> bool:
    """能否导入 flask 与 sentence-transformers（BGE 服务的硬依赖）"""
    try:
        r = subprocess.run(
            [py, "-c", "import flask, sentence_transformers"],
            capture_output=True, timeout=120,
        )
        return r.returncode == 0
    except Exception:
        return False


def pick_embed_python() -> str | None:
    """找一个具备 BGE 依赖的解释器：EMBED_PYTHON > 当前解释器 > PATH > py 启动器"""
    cands: list[str] = []
    env_py = os.environ.get("EMBED_PYTHON")
    if env_py:
        cands.append(env_py)
    cands.append(sys.executable)
    for name in ("python", "python3"):
        p = shutil.which(name)
        if p:
            cands.append(p)
    if os.name == "nt":
        try:
            out = subprocess.run(
                ["py", "-0p"], capture_output=True, text=True, timeout=20,
            ).stdout
            for line in out.splitlines():
                token = line.strip().split()[-1] if line.strip() else ""
                if token.lower().endswith("python.exe"):
                    cands.append(token)
        except Exception:
            pass

    seen = set()
    for py in cands:
        key = os.path.normcase(py)
        if key in seen or not os.path.exists(py):
            continue
        seen.add(key)
        if can_run_embed(py):
            return py
        print(f"      跳过 {py}（缺少 flask / sentence-transformers）")
    return None


def start_embed() -> subprocess.Popen | None:
    if http_ok(EMBED_URL + "/health"):
        print("[1/2] BGE 向量服务已在运行，复用")
        return None
    script = ROOT / "scripts" / "embed_server.py"
    if not script.exists():
        print(f"      [警告] 未找到 {script}，跳过向量服务")
        return None
    py = pick_embed_python()
    if not py:
        print("      [警告] 没有找到同时具备 flask 与 sentence-transformers 的 Python")
        print("             可用 set EMBED_PYTHON=<python.exe> 指定，本次跳过向量服务")
        print("             影响：AI 检索自动降级为关键词模式")
        return None
    print(f"[1/2] 启动 BGE 向量服务（8100，解释器 {py}）...")
    env = dict(os.environ, PYTHONUTF8="1", PYTHONIOENCODING="utf-8")
    proc = subprocess.Popen([py, str(script)], cwd=str(ROOT), env=env)
    if wait_until(lambda: http_ok(EMBED_URL + "/health"), 120, "BGE 向量服务"):
        print("      ✓ 8100 就绪（embed + reranker）")
    else:
        print("      向量检索将自动降级为关键词模式")
    return proc


def npm_command() -> list[str] | None:
    npm = shutil.which("npm")
    if not npm:
        return None
    # Windows 下 npm 是 .cmd，必须经 cmd /c 启动
    return ["cmd", "/c", "npm", "run", "dev"] if os.name == "nt" else [npm, "run", "dev"]


def kill_tree(proc: subprocess.Popen | None) -> None:
    if proc is None or proc.poll() is not None:
        return
    try:
        if os.name == "nt":
            subprocess.run(
                ["taskkill", "/PID", str(proc.pid), "/T", "/F"],
                capture_output=True, timeout=15,
            )
        else:
            proc.terminate()
            proc.wait(timeout=10)
    except Exception as e:
        print(f"      [警告] 结束子进程失败：{e}")


def main() -> int:
    # 输出重定向到文件时 Python 默认块缓冲，启动进度会长时间不显示，这里改为逐行刷新
    try:
        sys.stdout.reconfigure(line_buffering=True)
        sys.stderr.reconfigure(line_buffering=True)
    except Exception:
        pass

    ap = argparse.ArgumentParser(description="墨韵诗心一键启动")
    ap.add_argument("--skip-bge", action="store_true", help="不启动本地 BGE 向量服务")
    ap.add_argument("--no-open", action="store_true", help="启动后不自动打开浏览器")
    args = ap.parse_args()

    print("=" * 52)
    print(" 墨韵诗心 · AI 古诗词探索平台 启动")
    print("=" * 52)

    conf = load_env()
    check_config(conf)

    if not port_open(3306):
        print("[错误] MySQL 3306 未监听，请先启动 MySQL 服务")
        return 1
    print("[0/2] MySQL 3306 ✓")

    if not (ROOT / "node_modules").is_dir():
        print("[错误] 缺少 node_modules，请先在项目目录执行 npm install")
        return 1
    if port_open(3000):
        if http_ok(WEB_URL + "/login"):
            print("[提示] 3000 上已有 Next.js 在运行，系统已可用，无需重复启动")
            print("       登录页 http://localhost:3000/login")
            print("       如需重启，请先结束现有进程：netstat -ano | findstr :3000 后 taskkill /PID <PID> /T /F")
            if not args.no_open:
                webbrowser.open(WEB_URL + "/login")
            return 0
        print("[错误] 端口 3000 被其他程序占用且未响应，请先释放该端口")
        return 1

    embed_proc = None if args.skip_bge else start_embed()
    if args.skip_bge:
        print("[1/2] 跳过 BGE（--skip-bge）")

    cmd = npm_command()
    if not cmd:
        print("[错误] 未找到 npm，请安装 Node.js ≥ 18.18 并加入 PATH")
        kill_tree(embed_proc)
        return 1

    print("[2/2] 启动 Next.js 开发服务器（3000）...")
    try:
        next_proc = subprocess.Popen(cmd, cwd=str(ROOT))
    except Exception as e:
        print(f"[错误] Next.js 启动失败：{e}")
        kill_tree(embed_proc)
        return 1

    if wait_until(lambda: http_ok(WEB_URL + "/login"), 180, "Next.js"):
        print("      ✓ 3000 就绪")
    else:
        print("      请查看上方 Next.js 日志排查")
        kill_tree(next_proc)
        kill_tree(embed_proc)
        return 1

    print()
    print("登录页   http://localhost:3000/login")
    print("工作台   http://localhost:3000/workbench")
    print("向量服务 http://127.0.0.1:8100/health")
    print("按 Ctrl+C 结束本次启动的进程")
    print()

    if not args.no_open:
        try:
            webbrowser.open(WEB_URL + "/login")
            print("已尝试在浏览器打开登录页；若未跳出，请手动访问上面的地址")
        except Exception:
            pass

    try:
        next_proc.wait()
    except KeyboardInterrupt:
        print("\n正在关闭...")
    finally:
        kill_tree(next_proc)
        kill_tree(embed_proc)
        print("已退出")
    return 0


if __name__ == "__main__":
    sys.exit(main())
