# -*- coding: utf-8 -*-
"""
import_to_mysql.py - 建表+灌数据一条命令搞定
读 .env 配置 → 执行 schema.sql → 灌入 5.7万诗+366赏析+30意象+200共现+7350诗人小传
"""
import os
import json
import glob
import pymysql
from opencc import OpenCC

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TANG_DIR = r"c:\Users\Lenovo\Desktop\传智杯\chinese-poetry-master\全唐诗"
DATA_DIR = os.path.join(ROOT, "data")
SCHEMA_PATH = os.path.join(ROOT, "mysql", "schema.sql")

cc = OpenCC("t2s")


def read_env():
    """读 .env 文件"""
    env_path = os.path.join(ROOT, ".env")
    cfg = {}
    if not os.path.exists(env_path):
        # 退回环境变量
        return {
            "host": os.environ.get("MYSQL_HOST", "127.0.0.1"),
            "port": int(os.environ.get("MYSQL_PORT", "3306")),
            "user": os.environ.get("MYSQL_USER", "root"),
            "password": os.environ.get("MYSQL_PASSWORD", ""),
            "database": os.environ.get("MYSQL_DATABASE", "ai_poetry"),
        }
    with open(env_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                cfg[k.strip()] = v
    return {
        "host": cfg.get("MYSQL_HOST", "127.0.0.1"),
        "port": int(cfg.get("MYSQL_PORT", "3306")),
        "user": cfg.get("MYSQL_USER", "root"),
        "password": cfg.get("MYSQL_PASSWORD", ""),
        "database": cfg.get("MYSQL_DATABASE", "ai_poetry"),
    }


def connect(cfg):
    return pymysql.connect(
        host=cfg["host"], port=cfg["port"], user=cfg["user"],
        password=cfg["password"], database=cfg["database"],
        charset="utf8mb4", autocommit=False,
    )


def run_schema(conn):
    """执行 schema.sql（按 ; 切分语句）"""
    with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
        sql_text = f.read()
    # 切分语句（简易：按分号+换行）
    stmts = []
    cur = []
    for line in sql_text.split("\n"):
        # 去注释
        if line.strip().startswith("--"):
            continue
        cur.append(line)
        if line.strip().endswith(";"):
            stmts.append("\n".join(cur))
            cur = []
    if cur:
        stmts.append("\n".join(cur))
    with conn.cursor() as cur:
        for s in stmts:
            s = s.strip()
            if not s:
                continue
            cur.execute(s)
    conn.commit()
    # 验证建表
    with conn.cursor() as cur:
        cur.execute("SHOW TABLES")
        tables = [r[0] for r in cur.fetchall()]
    print(f"[OK] schema 执行完成，共 {len(tables)} 张表: {tables}")


def import_poems(conn):
    """导入全唐诗到 poems 表"""
    tang300_path = os.path.join(TANG_DIR, "唐诗三百首.json")
    tang300_tags = {}
    if os.path.exists(tang300_path):
        with open(tang300_path, "r", encoding="utf-8") as f:
            for p in json.load(f):
                tang300_tags[p["id"]] = p.get("tags", [])

    rows = []
    files = sorted(glob.glob(os.path.join(TANG_DIR, "poet.tang.*.json")))
    print(f"[INFO] 全唐诗文件: {len(files)}")
    for fp in files:
        with open(fp, "r", encoding="utf-8") as f:
            for p in json.load(f):
                rows.append((
                    p["id"],
                    cc.convert(p.get("title", "")),
                    cc.convert(p.get("author", "")),
                    "唐",
                    json.dumps(p.get("paragraphs", []), ensure_ascii=False),
                    json.dumps([cc.convert(x) for x in p.get("paragraphs", [])], ensure_ascii=False),
                    json.dumps(tang300_tags.get(p["id"], []), ensure_ascii=False),
                    os.path.basename(fp),
                ))
    print(f"[INFO] poems 待灌入: {len(rows)} 行")
    sql = """INSERT INTO poems (id,title,author,dynasty,paragraphs,paragraphs_simp,tags,source_file)
             VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
             ON DUPLICATE KEY UPDATE title=VALUES(title)"""
    with conn.cursor() as cur:
        # 分批 executemany，每批1000
        for i in range(0, len(rows), 1000):
            cur.executemany(sql, rows[i:i+1000])
            print(f"  [poems] {min(i+1000, len(rows))}/{len(rows)}")
    conn.commit()


def import_poet_bios(conn):
    """导入诗人小传"""
    rows = []
    for fn, dynasty in [("authors.tang.json", "唐"), ("authors.song.json", "宋")]:
        fp = os.path.join(TANG_DIR, fn)
        if not os.path.exists(fp):
            continue
        with open(fp, "r", encoding="utf-8") as f:
            for a in json.load(f):
                rows.append((
                    a["id"],
                    cc.convert(a.get("name", "")),
                    dynasty,
                    a.get("desc", ""),
                    cc.convert(a.get("desc", "")),
                ))
    print(f"[INFO] poet_bios 待灌入: {len(rows)} 行")
    sql = """INSERT INTO poet_bios (id,name,dynasty,bio_desc,bio_simp)
             VALUES (%s,%s,%s,%s,%s) ON DUPLICATE KEY UPDATE name=VALUES(name)"""
    with conn.cursor() as cur:
        for i in range(0, len(rows), 1000):
            cur.executemany(sql, rows[i:i+1000])
    conn.commit()


def import_imagery(conn):
    """导入意象清单、诗-意象关联、共现边"""
    with open(os.path.join(DATA_DIR, "imagery.json"), "r", encoding="utf-8") as f:
        d = json.load(f)
    # imagery 主表
    imagery_rows = [(k, v) for k, v in d["imagery_count"].items()]
    print(f"[INFO] imagery: {len(imagery_rows)} 行")
    with conn.cursor() as cur:
        cur.executemany("INSERT INTO imagery (`char`,`count`) VALUES (%s,%s) ON DUPLICATE KEY UPDATE `count`=VALUES(`count`)", imagery_rows)
    conn.commit()
    # poem_imagery
    pi_rows = []
    for im, poems in d["imagery_poems"].items():
        for p in poems:
            pi_rows.append((p["id"], im, p.get("line", "")))
    print(f"[INFO] poem_imagery: {len(pi_rows)} 行")
    with conn.cursor() as cur:
        for i in range(0, len(pi_rows), 1000):
            cur.executemany(
                "INSERT INTO poem_imagery (poem_id,imagery_char,line_text) VALUES (%s,%s,%s) ON DUPLICATE KEY UPDATE line_text=VALUES(line_text)",
                pi_rows[i:i+1000],
            )
    conn.commit()
    # 共现
    co_rows = [(e["source"], e["target"], e["weight"]) for e in d["co_occurrence"]]
    print(f"[INFO] imagery_cooccurrence: {len(co_rows)} 行")
    with conn.cursor() as cur:
        cur.executemany(
            "INSERT INTO imagery_cooccurrence (source_char,target_char,weight) VALUES (%s,%s,%s) ON DUPLICATE KEY UPDATE weight=VALUES(weight)",
            co_rows,
        )
    conn.commit()


def import_annotations(conn):
    """导入赏析数据"""
    fp = os.path.join(DATA_DIR, "shangxi.json")
    if not os.path.exists(fp):
        print("[WARN] shangxi.json 不存在，跳过")
        return
    with open(fp, "r", encoding="utf-8") as f:
        data = json.load(f)
    rows = []
    for r in data:
        if not r or not r.get("local_id"):
            continue
        rows.append((
            r["local_id"],
            r.get("fanyi", ""),
            r.get("shangxi", ""),
            r.get("zhushihui", ""),
            r.get("source", "AI生成(GLM-4-Flash)"),
            r.get("model", "glm-4-flash"),
        ))
    print(f"[INFO] annotations 待灌入: {len(rows)} 行")
    sql = """INSERT INTO annotations (poem_id,fanyi,shangxi,zhushihui,source,model)
             VALUES (%s,%s,%s,%s,%s,%s) ON DUPLICATE KEY UPDATE fanyi=VALUES(fanyi)"""
    with conn.cursor() as cur:
        for i in range(0, len(rows), 500):
            cur.executemany(sql, rows[i:i+500])
    conn.commit()


def main():
    cfg = read_env()
    print(f"[INFO] 连接 {cfg['user']}@{cfg['host']}:{cfg['port']}/{cfg['database']}")
    conn = connect(cfg)
    print("[OK] MySQL 连接成功")
    print("=== [1/5] 执行 schema ===")
    run_schema(conn)
    print("=== [2/5] 灌入 poems ===")
    import_poems(conn)
    print("=== [3/5] 灌入 poet_bios ===")
    import_poet_bios(conn)
    print("=== [4/5] 灌入 imagery ===")
    import_imagery(conn)
    print("=== [5/5] 灌入 annotations ===")
    import_annotations(conn)
    # 验证行数
    with conn.cursor() as cur:
        for tbl in ["poems", "annotations", "poet_bios", "imagery", "poem_imagery", "imagery_cooccurrence"]:
            cur.execute(f"SELECT COUNT(*) FROM {tbl}")
            n = cur.fetchone()[0]
            print(f"  [COUNT] {tbl}: {n}")
    conn.close()
    print("[DONE] 全部完成")


if __name__ == "__main__":
    main()
