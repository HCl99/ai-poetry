# -*- coding: utf-8 -*-
"""核查 poems.source_file 分布 + annotations 来源"""
import pymysql

conn = pymysql.connect(host='127.0.0.1', user='root', password='REDACTED_DB_PASSWORD',
                       database='ai_poetry', charset='utf8mb4')
cur = conn.cursor()

print('=== poems.source_file 分布 ===')
cur.execute("SELECT source_file, COUNT(*) FROM poems GROUP BY source_file ORDER BY 2 DESC")
for r in cur.fetchall():
    print(f'  {r[0]}: {r[1]}')

print('\n=== annotations 表结构 ===')
cur.execute("SHOW COLUMNS FROM annotations")
print(' ', [r[0] for r in cur.fetchall()])

cur.execute("SELECT poem_id, LEFT(content, 50) FROM annotations LIMIT 2")
print('annotations 抽样:')
for r in cur.fetchall():
    print(' ', r)

cur.execute("SELECT COUNT(*) FROM annotations a JOIN poems p ON a.poem_id = p.id")
print('annotations 关联到 poems 的数量:', cur.fetchone()[0])

print('\n=== poet_bios.source 分布 ===')
cur.execute("SHOW COLUMNS FROM poet_bios")
print(' ', [r[0] for r in cur.fetchall()])
conn.close()
