import { prisma } from '@/lib/prisma';

/** 通知类型常量 */
export const NOTIF_TYPE = {
  FEEDBACK_REPLY: 'feedback_reply',
  POST_APPROVED: 'post_approved',
  POST_REJECTED: 'post_rejected',
  SHARE_APPROVED: 'share_approved',
  SHARE_REJECTED: 'share_rejected',
  SHARE_TAKEDOWN: 'share_takedown',
} as const;

export type NotifType = typeof NOTIF_TYPE[keyof typeof NOTIF_TYPE];

/** 给某个用户发一条通知（静默失败，不阻塞主流程） */
export async function sendNotification(
  userId: string,
  type: NotifType,
  title: string,
  body: string,
  link?: string,
) {
  try {
    await prisma.notification.create({
      data: { userId, type, title, body, link: link || null },
    });
  } catch (e) {
    // 通知写失败不影响主业务，只在服务端记一下
    console.warn('[notification] 发送失败', { userId, type, error: (e as Error)?.message });
  }
}
