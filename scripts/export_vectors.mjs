// 导出向量库二进制缓存：data/vectors.bin + data/vectors.meta.json
// 用途：服务启动时直接读本地缓存，避免每次从 MySQL 拉 344k 行、解析 1.5GB JSON 文本。
// 用法：npm run vectors:export（数据变化后重跑一次）
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Node 不会自动读 .env，这里按 Next 的习惯加载一次（已有环境变量优先）
const envPath = path.join(ROOT, '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
  }
}

const prisma = new PrismaClient();
const PAGE = 5000;
const OUT_BIN = path.join(ROOT, 'data', 'vectors.bin');
const OUT_META = path.join(ROOT, 'data', 'vectors.meta.json');

async function main() {
  const t0 = Date.now();
  const total = await prisma.chunk.count({
    where: { chunkType: 'poem', embedding: { not: null }, refId: { not: null } },
  });
  console.log(`[export] 待导出 ${total} 条 poem 向量`);

  const ids = [];
  const vecs = [];
  let dims = 0;
  let cursor;
  for (let fetched = 0; fetched < total; ) {
    const chunks = await prisma.chunk.findMany({
      where: { chunkType: 'poem', embedding: { not: null }, refId: { not: null } },
      select: { id: true, refId: true, embedding: true },
      orderBy: { id: 'asc' },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    });
    if (chunks.length === 0) break;
    for (const c of chunks) {
      cursor = c.id;
      try {
        const v = JSON.parse(c.embedding);
        if (!Array.isArray(v) || v.length === 0) continue;
        if (dims === 0) dims = v.length;
        if (v.length !== dims) continue;
        let norm = 0;
        for (const x of v) norm += x * x; // L2 归一化，与运行期一致
        norm = Math.sqrt(norm) || 1;
        ids.push(c.refId);
        vecs.push(v.map((x) => x / norm));
      } catch {
        /* 跳过坏行 */
      }
    }
    fetched += chunks.length;
    console.log(`[export] ${fetched}/${total} (${Date.now() - t0}ms)`);
  }

  const count = ids.length;
  const mat = new Float32Array(count * dims);
  for (let i = 0; i < count; i++) mat.set(vecs[i], i * dims);

  const poems = await prisma.poem.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true, author: true, dynasty: true },
  });
  const meta = {};
  for (const p of poems) meta[p.id] = { title: p.title, author: p.author, dynasty: p.dynasty };

  fs.mkdirSync(path.dirname(OUT_BIN), { recursive: true });
  fs.writeFileSync(OUT_BIN, Buffer.from(mat.buffer));
  fs.writeFileSync(OUT_META, JSON.stringify({ dims, count, ids, meta }));
  const binMB = (fs.statSync(OUT_BIN).size / 1048576).toFixed(1);
  const metaMB = (fs.statSync(OUT_META).size / 1048576).toFixed(1);
  console.log(`[export] 完成 ${count} 条 / ${dims}d，bin ${binMB}MB，meta ${metaMB}MB，用时 ${Date.now() - t0}ms`);
}

main()
  .catch((e) => {
    console.error('[export] 失败：', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
