# -*- coding: utf-8 -*-
"""按 poet_bios.name 回填 poems.dynasty，并报告结果"""
import pymysql

conn = pymysql.connect(host='127.0.0.1', user='root', password='REDACTED_DB_PASSWORD',
                       database='ai_poetry', charset='utf8mb4')
cur = conn.cursor()

cur.execute("SELECT COUNT(*) FROM poems p JOIN poet_bios b ON p.author = b.name")
print('matched poems:', cur.fetchone()[0])

cur.execute(
    "UPDATE poems p JOIN poet_bios b ON p.author = b.name "
    "SET p.dynasty = b.dynasty WHERE p.dynasty <> b.dynasty")
print('updated rows:', cur.rowcount)
conn.commit()

cur.execute("SELECT dynasty, COUNT(*) FROM poems GROUP BY dynasty ORDER BY 2 DESC")
for row in cur.fetchall():
    print(' ', row)

cur.execute("SELECT DISTINCT JSON_EXTRACT(tags, '$[0]') FROM poems WHERE JSON_LENGTH(tags) > 0 LIMIT 20")
print('sample tags[0]:', [r[0] for r in cur.fetchall()])
conn.close()
