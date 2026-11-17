/**
 * 社区帖子分类：运行时可维护的配置（管理端「分类管理」可增删改）。
 *
 * 为什么不放数据库：评审环境导入的是既有的 ai_poetry.sql，新增表需要额外迁移，
 * 一旦漏执行会导致整条发帖链路不可用。这里用项目内的小 JSON 文件做真相源，
 * 读写都在服务端、不需要任何数据库迁移；文件缺失/损坏时自动回落到内置默认值。
 * 每次读取都直读文件（不设进程内缓存），保证管理员改动后另一端立刻可见。
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface PostCategory {
  id: string;
  name: string;
  desc: string;
}

/** 首次运行 / 配置文件缺失时的内置分类 */
export const DEFAULT_POST_CATEGORIES: PostCategory[] = [
  { id: 'appreciation', name: '诗词赏析', desc: '品读名篇、拆解技法的深度赏析帖' },
  { id: 'notes', name: '学习心得', desc: '背诵方法、学习路线与打卡记录' },
  { id: 'original', name: '原创诗词', desc: '风格迁移作品与原创习作分享' },
  { id: 'qa', name: '问答', desc: '字词句疑惑、典故出处求助' },
];

export const MAX_CATEGORIES = 12;
const STORE_PATH = path.join(process.cwd(), 'data', 'post-categories.json');

/** 串行化写入，避免两个管理员同时保存时互相覆盖 */
let writeChain: Promise<unknown> = Promise.resolve();

function cloneDefaults(): PostCategory[] {
  return DEFAULT_POST_CATEGORIES.map((c) => ({ ...c }));
}

/** 读取分类列表；任何异常都回落到默认值，保证发帖链路永远可用 */
export async function getPostCategories(): Promise<PostCategory[]> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(STORE_PATH, 'utf8'));
    if (!Array.isArray(parsed)) return cloneDefaults();
    const list = parsed
      .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
      .map((x) => ({
        id: String(x.id || '').trim(),
        name: String(x.name || '').trim(),
        desc: String(x.desc || '').trim(),
      }))
      .filter((c) => c.id && c.name);
    return list.length ? list : cloneDefaults();
  } catch {
    return cloneDefaults();
  }
}

export async function categoryNames(): Promise<string[]> {
  return (await getPostCategories()).map((c) => c.name);
}

export async function isPostCategory(name: string): Promise<boolean> {
  return (await categoryNames()).includes(name);
}

/**
 * 校验管理端提交的分类列表。
 * 用纯 Error 抛错，由路由层转成 400；不依赖 apiHandler，便于单测直接调用。
 */
export function validateCategories(input: unknown): PostCategory[] {
  if (!Array.isArray(input) || input.length === 0) throw new Error('分类列表不能为空');
  if (input.length > MAX_CATEGORIES) throw new Error(`最多支持 ${MAX_CATEGORIES} 个分类`);

  const list: PostCategory[] = input.map((raw, i) => {
    if (!raw || typeof raw !== 'object') throw new Error(`第 ${i + 1} 项格式错误`);
    const x = raw as Record<string, unknown>;
    const id = String(x.id || '').trim();
    const name = String(x.name || '').trim();
    const desc = String(x.desc || '').trim();
    if (!id || id.length > 40) throw new Error(`第 ${i + 1} 项缺少有效标识`);
    if (!name || name.length > 12) throw new Error('分类名称需为 1-12 个字符');
    if (desc.length > 60) throw new Error('分类描述不能超过 60 字');
    return { id, name, desc: desc || '暂无描述' };
  });

  const ids = new Set<string>();
  const names = new Set<string>();
  for (const c of list) {
    if (ids.has(c.id)) throw new Error(`分类标识「${c.id}」重复`);
    if (names.has(c.name)) throw new Error(`分类名称「${c.name}」重复`);
    ids.add(c.id);
    names.add(c.name);
  }
  return list;
}

/** 保存分类列表（原子替换优先，Windows 文件锁场景下退回直接覆盖） */
export async function savePostCategories(list: PostCategory[]): Promise<void> {
  const payload = JSON.stringify(list, null, 2);
  const job = async () => {
    await fs.mkdir(path.dirname(STORE_PATH), { recursive: true });
    const tmp = `${STORE_PATH}.${process.pid}.tmp`;
    try {
      await fs.writeFile(tmp, payload, 'utf8');
      await fs.rename(tmp, STORE_PATH);
    } catch (err) {
      // 部分 Windows 环境禁止 rename 覆盖已存在文件，退化写法并清理临时文件
      await fs.writeFile(STORE_PATH, payload, 'utf8');
      await fs.rm(tmp, { force: true }).catch(() => undefined);
      void err;
    }
  };
  writeChain = writeChain.then(job, job);
  await writeChain;
}
