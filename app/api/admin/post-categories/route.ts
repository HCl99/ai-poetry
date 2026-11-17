import { requireAdmin } from '@/lib/admin';
import { prisma } from '@/lib/prisma';
import {
  DEFAULT_POST_CATEGORIES, getPostCategories, savePostCategories, validateCategories,
  type PostCategory,
} from '@/lib/postCategories';
import { withApi, ApiError } from '@/lib/apiHandler';

export const dynamic = 'force-dynamic';

/** F14 分类管理：分类清单 + 各分类实际帖子数 */
async function GET_impl() {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: '无权访问' }, { status: 403 });

  const [items, grouped] = await Promise.all([
    getPostCategories(),
    prisma.post.groupBy({ by: ['category'], _count: { _all: true } }),
  ]);
  const countMap = new Map(grouped.map((g) => [g.category, g._count._all]));

  return Response.json({
    items: items.map((c) => ({ ...c, postCount: countMap.get(c.name) || 0 })),
    totalPosts: [...countMap.values()].reduce((s, n) => s + n, 0),
  });
}

/** 校验并落库：改名自动迁移存量帖子，删除前检查占用 */
async function applyChange(next: PostCategory[], old: PostCategory[]) {
  const oldById = new Map(old.map((c) => [c.id, c]));
  const nextIds = new Set(next.map((c) => c.id));

  // 目标名不能撞上另一个分类的现用名，避免出现两个分类指向同一字符串
  for (const c of next) {
    const owner = old.find((o) => o.name === c.name);
    if (owner && owner.id !== c.id) {
      throw new ApiError(400, `「${c.name}」已是现有分类的名称，请换一个`);
    }
  }

  // 删除保护：仍有帖子的分类不允许直接删除
  for (const o of old) {
    if (nextIds.has(o.id)) continue;
    const used = await prisma.post.count({ where: { category: o.name } });
    if (used > 0) {
      throw new ApiError(400, `「${o.name}」下还有 ${used} 条帖子，请先把这些帖子改到其他分类后再删除`);
    }
  }

  // 改名迁移：posts.category 存的是名称字符串，必须同步更新，否则历史帖子会「掉分类」
  for (const c of next) {
    const prev = oldById.get(c.id);
    if (prev && prev.name !== c.name) {
      await prisma.post.updateMany({ where: { category: prev.name }, data: { category: c.name } });
    }
  }

  await savePostCategories(next);
}

/** F14 分类管理：保存整份分类清单（新增 / 改名 / 改描述 / 删除统一走这里） */
async function PUT_impl(req: Request) {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: '无权访问' }, { status: 403 });

  const body = (await req.json()) as { items?: unknown };
  let next: PostCategory[];
  try {
    next = validateCategories(body.items);
  } catch (e) {
    throw new ApiError(400, (e as Error).message);
  }

  const old = await getPostCategories();
  await applyChange(next, old);
  return Response.json({ ok: true, items: next });
}

/** F14 分类管理：恢复内置默认分类（有帖子挂在自定义分类下时拒绝） */
async function POST_impl(req: Request) {
  const session = await requireAdmin();
  if (!session) return Response.json({ error: '无权访问' }, { status: 403 });

  const { action } = (await req.json()) as { action?: string };
  if (action !== 'reset') throw new ApiError(400, '未知操作');

  const old = await getPostCategories();
  const defaults = DEFAULT_POST_CATEGORIES.map((c) => ({ ...c }));
  await applyChange(defaults, old);
  return Response.json({ ok: true, items: defaults });
}

export const GET = withApi(GET_impl);
export const PUT = withApi(PUT_impl);
export const POST = withApi(POST_impl);
