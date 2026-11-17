import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { withApi } from '@/lib/apiHandler';
import { isStage, isGoal, STAGE_LABEL, normalizeStage, type Goal } from '@/lib/classics';

export const dynamic = 'force-dynamic';

/** 读取当前用户的学习画像：学段 + 方向 + 是否已引导 */
async function GET_impl() {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });
  const u = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { stage: true, goal: true, onboarded: true },
  });
  const stage = normalizeStage(u?.stage);
  const goal = isGoal(u?.goal) ? u.goal : 'exam';
  return Response.json({ stage, label: STAGE_LABEL[stage], goal, onboarded: u?.onboarded ?? false });
}

/** 修改学段/方向：决定背诵闯关与诗词测验的题源、难度与默认题型 */
async function PUT_impl(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return Response.json({ error: '未登录' }, { status: 401 });

  const body = (await req.json()) as { stage?: string; goal?: string; onboarded?: boolean };
  if (body.stage !== undefined && !isStage(body.stage)) return Response.json({ error: '学段取值非法' }, { status: 400 });
  if (body.goal !== undefined && !isGoal(body.goal)) return Response.json({ error: '方向取值非法' }, { status: 400 });

  const data: { stage?: string; goal?: string; onboarded?: boolean } = {};
  if (body.stage) data.stage = body.stage;
  if (body.goal) data.goal = body.goal as Goal;
  if (body.onboarded !== undefined) data.onboarded = body.onboarded;
  // 只要提交了学段或方向，即视为完成「定方向」
  if (body.stage || body.goal) data.onboarded = true;

  const u = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { stage: true, goal: true, onboarded: true },
  });
  const stage = normalizeStage(u.stage);
  return Response.json({ ok: true, stage, label: STAGE_LABEL[stage], goal: u.goal, onboarded: u.onboarded });
}

export const GET = withApi(GET_impl);
export const PUT = withApi(PUT_impl);
