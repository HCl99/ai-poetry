#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""墨韵诗心 - 一键启动脚本

流程：配置检查 -> MySQL 3306 -> 本地微服务（向量 8100 / 语音识别 8101 / 语音合成 8102）-> Next.js 3000

用法：
    python run.py             # 启动全部（已在运行的组件复用，不重复拉起）
    python run.py --skip-bge  # 不启动 BGE 向量服务（其余照常）
    python run.py --doctor    # 环境自检与修复（数据库连接、数据导入、演示账号）

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
ASR_URL = "http://127.0.0.1:8101"
TTS_URL = "http://127.0.0.1:8102"

# 本地 Python 微服务：(名称, 健康检查地址, 脚本, 必需依赖)
SERVICES = [
    ("BGE 向量服务", EMBED_URL, "scripts/embed_server.py", ("flask", "sentence_transformers")),
    ("语音识别服务", ASR_URL, "scripts/asr_server.py", ("flask", "faster_whisper")),
    ("情感语音合成", TTS_URL, "scripts/tts_server.py", ("flask", "edge_tts")),
]

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


# ---------------- 环境自检 / 修复（--doctor） ----------------

# 测试账号 test / test123456 的 bcrypt 哈希（与 data/ai_poetry.sql 内一致）
DEMO_HASH = "$2a$10$P7zKZWmoD1yrUgpE16aPo.Bz0RiQxNp3I/Q7r3cSc/pOi96mKIlo6"


def read_env_lines(path: Path) -> list[str]:
    return path.read_text(encoding="utf-8").splitlines()


def set_env_value(lines: list[str], key: str, value: str) -> list[str]:
    out: list[str] = []
    hit = False
    for line in lines:
        if line.strip().startswith(key + "="):
            out.append(f"{key}={value}")
            hit = True
        else:
            out.append(line)
    if not hit:
        out.append(f"{key}={value}")
    return out


def mysql_client() -> str | None:
    """定位 mysql.exe：PATH 优先，其次常见安装目录"""
    found = shutil.which("mysql")
    if found:
        return found
    import glob as _glob

    patterns = [
        r"C:\Program Files\MySQL\MySQL Server *\bin\mysql.exe",
        r"C:\Program Files (x86)\MySQL\MySQL Server *\bin\mysql.exe",
        r"C:\xampp\mysql\bin\mysql.exe",
        r"C:\phpstudy_pro\Extensions\MySQL*\bin\mysql.exe",
        r"C:\wamp64\bin\mysql\mysql*\bin\mysql.exe",
        r"C:\Program Files\MariaDB*\bin\mysql.exe",
    ]
    for pat in patterns:
        hits = sorted(_glob.glob(pat), reverse=True)
        if hits:
            return hits[0]
    return None


def mysql_query(mysql: str, conf: dict, sql: str, database: str | None = None) -> tuple[int, str]:
    env = dict(os.environ, MYSQL_PWD=conf.get("MYSQL_PASSWORD", ""), PYTHONIOENCODING="utf-8")
    cmd = [
        mysql, "-h", conf.get("MYSQL_HOST", "127.0.0.1"), "-P", conf.get("MYSQL_PORT", "3306"),
        "-u", conf.get("MYSQL_USER", "root"), "--connect-timeout=8", "-N", "-B", "-e", sql,
    ]
    if database:
        cmd.insert(cmd.index("-N"), database)
    try:
        r = subprocess.run(
            cmd, capture_output=True, text=True, encoding="utf-8", errors="replace", env=env, timeout=180,
        )
    except Exception as e:  # noqa: BLE001 - 自检脚本需要把异常转成可读提示
        return 1, str(e)
    return r.returncode, ((r.stdout or "") + (r.stderr or "")).strip()


def doctor(conf: dict) -> int:
    """体检并修复：数据库连接、DATABASE_URL、数据导入、测试账号。

    对接收方电脑（换了 MySQL 密码 / 没导入数据）最有效，不改业务代码。
    """
    import getpass
    from urllib.parse import quote

    env_path = ROOT / ".env"

    print("[1/5] 查找 MySQL 客户端 ...")
    mysql = mysql_client()
    if not mysql:
        print("      [X] 没找到 mysql 命令")
        print("          请安装 MySQL 8，或把 MySQL 的 bin 目录加入 PATH 后重试")
        return 1
    print(f"      [OK] {mysql}")

    print("[2/5] 检查数据库连接 ...")
    code, out = mysql_query(mysql, conf, "SELECT VERSION();")
    tries = 0
    while code != 0 and tries < 2:
        reason = out.splitlines()[-1] if out else "未知错误"
        print(f"      [X] 连接失败：{reason}")
        print("          常见原因：MySQL80 服务没启动，或这台电脑的 root 密码不是 .env 里写的那个")
        print("          可先按 Win+R 输入 services.msc 确认 MySQL80 正在运行")
        conf["MYSQL_PASSWORD"] = getpass.getpass("      请输入本机 MySQL root 密码（不回显，直接回车=空密码）: ")
        code, out = mysql_query(mysql, conf, "SELECT VERSION();")
        tries += 1
    if code != 0:
        print("      [X] 仍然连不上，请确认 MySQL 已启动且密码正确")
        return 1
    print(f"      [OK] MySQL {out.splitlines()[0]}")

    print("[3/5] 同步 .env 的连接串 ...")
    db = conf.get("MYSQL_DATABASE", "ai_poetry")
    url = "mysql://{}:{}@{}:{}/{}".format(
        quote(conf.get("MYSQL_USER", "root"), safe=""),
        quote(conf.get("MYSQL_PASSWORD", ""), safe=""),
        conf.get("MYSQL_HOST", "127.0.0.1"),
        conf.get("MYSQL_PORT", "3306"),
        db,
    )
    lines = read_env_lines(env_path)
    changed: list[str] = []
    if conf.get("DATABASE_URL") != url:
        lines = set_env_value(lines, "DATABASE_URL", url)
        conf["DATABASE_URL"] = url
        changed.append("DATABASE_URL")
    if "trycloudflare.com" in conf.get("AUTH_URL", ""):
        lines = set_env_value(lines, "AUTH_URL", "http://localhost:3000")
        conf["AUTH_URL"] = "http://localhost:3000"
        changed.append("AUTH_URL")
    if changed:
        env_path.write_text("\n".join(lines) + "\n", encoding="utf-8")
        print("      [OK] 已修正：" + "、".join(changed))
    else:
        print("      [OK] 连接串正确，无需修改")

    print("[4/5] 检查数据库与诗库数据 ...")
    code, out = mysql_query(
        mysql, conf, f"SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='{db}';"
    )
    if code != 0 or out.strip() != "1":
        print(f"      数据库 {db} 不存在，正在创建 ...")
        code, out = mysql_query(
            mysql, conf,
            f"CREATE DATABASE IF NOT EXISTS `{db}` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;",
        )
        if code != 0:
            print(f"      [X] 创建失败：{out}")
            return 1

    code, out = mysql_query(mysql, conf, "SELECT COUNT(*) FROM users;", db)
    users = int(out) if code == 0 and out.isdigit() else 0
    if users == 0:
        dump = ROOT / "data" / "ai_poetry.sql"
        print("      [X] users 表为空：数据没有导入（这就是登录报『账号或密码错误』的原因）")
        if not dump.exists():
            print("          找不到 data\\ai_poetry.sql，请重新解压完整的压缩包")
            return 1
        ans = input("      现在导入数据？约 1.8GB，需要 2-5 分钟 [y/N]: ").strip().lower()
        if ans not in ("y", "yes"):
            print("      已跳过，登录仍会失败")
            return 1
        print("      正在导入，期间请不要关闭窗口 ...")
        env = dict(os.environ, MYSQL_PWD=conf.get("MYSQL_PASSWORD", ""))
        cmd = (
            f'"{mysql}" -h {conf.get("MYSQL_HOST", "127.0.0.1")} -P {conf.get("MYSQL_PORT", "3306")} '
            f'-u {conf.get("MYSQL_USER", "root")} {db} < "{dump}"'
        )
        r = subprocess.run(cmd, shell=True, env=env)
        if r.returncode != 0:
            print("      [X] 导入失败，请检查压缩包是否完整")
            return 1
        code, out = mysql_query(mysql, conf, "SELECT COUNT(*) FROM users;", db)
        users = int(out) if code == 0 and out.isdigit() else 0
        if users == 0:
            print("      [X] 导入后仍无账号，请联系开发者")
            return 1
        print(f"      [OK] 导入完成，账号数 {users}")

    code, out = mysql_query(mysql, conf, "SELECT COUNT(*) FROM poems;", db)
    poems = int(out) if code == 0 and out.isdigit() else "未知"
    print(f"      [OK] 数据库 {db} 就绪，诗词 {poems} 首，账号 {users} 个")

    print("[5/5] 检查演示账号 test ...")
    code, out = mysql_query(
        mysql, conf, "SELECT COUNT(*) FROM users WHERE username='test' OR email='test@poetry.ai';", db
    )
    exists = code == 0 and out.isdigit() and int(out) > 0
    if exists:
        mysql_query(
            mysql, conf,
            f"UPDATE users SET password_hash='{DEMO_HASH}', status='active' "
            "WHERE username='test' OR email='test@poetry.ai';",
            db,
        )
        print("      [OK] test 账号已重置为 test123456")
    else:
        sql = (
            "INSERT INTO users (id,email,username,name,password_hash,role,status,stage,goal,onboarded) "
            f"VALUES (UUID(),'test@poetry.ai','test','墨韵诗心', '{DEMO_HASH}','user','active','junior','exam',0) "
            "ON DUPLICATE KEY UPDATE password_hash=VALUES(password_hash), status='active';"
        )
        code, out = mysql_query(mysql, conf, sql, db)
        if code != 0:
            print(f"      [X] 创建失败：{out}")
            return 1
        print("      [OK] 已创建 test 账号（密码 test123456）")

    print()
    print("=" * 52)
    print(" 自检完成，环境正常")
    print(" 登录账号：test@poetry.ai / test （密码 test123456）")
    print(" 下一步：在项目目录执行 python run.py 启动系统")
    print("=" * 52)
    return 0


def can_import(py: str, deps: tuple[str, ...]) -> bool:
    """解释器能否导入指定依赖"""
    try:
        r = subprocess.run(
            [py, "-c", f"import {', '.join(deps)}"],
            capture_output=True, timeout=120,
        )
        return r.returncode == 0
    except Exception:
        return False


def pick_python(deps: tuple[str, ...]) -> str | None:
    """找一个具备指定依赖的解释器：EMBED_PYTHON > 当前解释器 > PATH > py 启动器"""
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
        if can_import(py, deps):
            return py
        print(f"      跳过 {py}（缺少 {' / '.join(deps)}）")
    return None


def start_service(name: str, url: str, script_rel: str, deps: tuple[str, ...]) -> subprocess.Popen | None:
    """按需拉起一个本地 Python 微服务（已就绪则复用）"""
    if http_ok(url + "/health"):
        print(f"      - {name}已在运行，复用（{url}）")
        return None
    script = ROOT / script_rel
    if not script.exists():
        print(f"      [警告] 未找到 {script}，跳过{name}")
        return None
    py = pick_python(deps)
    if not py:
        print(f"      [警告] 没有找到具备 {' / '.join(deps)} 的 Python，跳过{name}")
        return None
    print(f"      - 启动{name}（{url}，解释器 {py}）...")
    env = dict(os.environ, PYTHONUTF8="1", PYTHONIOENCODING="utf-8")
    proc = subprocess.Popen([py, str(script)], cwd=str(ROOT), env=env)
    if wait_until(lambda: http_ok(url + "/health"), 120, name):
        print(f"      [OK] {name}就绪（{url}）")
    else:
        print(f"      [提示] {name}未在 120s 内就绪，相关功能将自动降级")
    return proc


def start_local_services(skip_bge: bool) -> list[subprocess.Popen]:
    procs: list[subprocess.Popen] = []
    for name, url, script, deps in SERVICES:
        if skip_bge and url == EMBED_URL:
            print("      - 跳过 BGE（--skip-bge）")
            continue
        proc = start_service(name, url, script, deps)
        if proc is not None:
            procs.append(proc)
    return procs


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
    ap.add_argument("--doctor", action="store_true", help="只做环境自检与修复（数据库/账号），不启动服务")
    args = ap.parse_args()

    if args.doctor:
        print("=" * 52)
        print(" 墨韵诗心 - 环境自检")
        print("=" * 52)
        return doctor(load_env())

    print("=" * 52)
    print(" 墨韵诗心 - AI 古诗词探索平台 启动")
    print("=" * 52)

    conf = load_env()
    check_config(conf)

    if not port_open(3306):
        print("[错误] MySQL 3306 未监听，请先启动 MySQL 服务")
        return 1
    print("[0/2] MySQL 3306 [OK]")

    if not (ROOT / "node_modules").is_dir():
        print("[错误] 缺少 node_modules，请先在项目目录执行 npm install")
        return 1

    next_running = False
    if port_open(3000):
        if not http_ok(WEB_URL + "/login"):
            print("[错误] 端口 3000 被其他程序占用且未响应，请先释放该端口")
            return 1
        next_running = True
        print("[提示] 3000 上已有 Next.js 在运行，复用现有服务")
        print("       如需重启，请先结束现有进程：netstat -ano | findstr :3000 后 taskkill /PID <PID> /T /F")

    print("[1/2] 检查本地 AI 微服务（向量 / 语音识别 / 语音合成）...")
    procs = start_local_services(args.skip_bge)

    if next_running:
        print()
        print("登录页   http://localhost:3000/login")
        print("工作台   http://localhost:3000/workbench")
        print("向量服务 http://127.0.0.1:8100/health   语音识别 http://127.0.0.1:8101/health   语音合成 http://127.0.0.1:8102/health")
        if not args.no_open:
            webbrowser.open(WEB_URL + "/login")
        return 0

    cmd = npm_command()
    if not cmd:
        print("[错误] 未找到 npm，请安装 Node.js ≥ 18.18 并加入 PATH")
        for p in procs:
            kill_tree(p)
        return 1

    print("[2/2] 启动 Next.js 开发服务器（3000）...")
    try:
        next_proc = subprocess.Popen(cmd, cwd=str(ROOT))
    except Exception as e:
        print(f"[错误] Next.js 启动失败：{e}")
        for p in procs:
            kill_tree(p)
        return 1

    if wait_until(lambda: http_ok(WEB_URL + "/login"), 180, "Next.js"):
        print("      [OK] 3000 就绪")
    else:
        print("      请查看上方 Next.js 日志排查")
        kill_tree(next_proc)
        for p in procs:
            kill_tree(p)
        return 1

    print()
    print("登录页   http://localhost:3000/login")
    print("工作台   http://localhost:3000/workbench")
    print("向量服务 http://127.0.0.1:8100/health   语音识别 http://127.0.0.1:8101/health   语音合成 http://127.0.0.1:8102/health")
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
        for p in procs:
            kill_tree(p)
        print("已退出")
    return 0


if __name__ == "__main__":
    sys.exit(main())
