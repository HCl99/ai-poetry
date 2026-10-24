import nodemailer from 'nodemailer';

/**
 * QQ 邮箱 SMTP 发信（授权码方式，非登录密码）。
 * 环境变量：SMTP_HOST / SMTP_PORT / SMTP_USER（QQ 邮箱地址）/ SMTP_PASS（授权码）/ SMTP_FROM（可选）
 */
const SMTP_HOST = process.env.SMTP_HOST || 'smtp.qq.com';
const SMTP_PORT = Number(process.env.SMTP_PORT || 465);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || `墨韵诗心 <${SMTP_USER}>`;

/** 未配置 SMTP 时发码接口返回 503，前端提示联系管理员，不静默失败 */
export const mailConfigured = Boolean(SMTP_USER && SMTP_PASS);

let transporter: nodemailer.Transporter | null = null;

function transport() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return transporter;
}

export type MailPurpose = 'register' | 'reset';

const COPY: Record<MailPurpose, { title: string; lead: string }> = {
  register: { title: '注册验证码', lead: '你正在注册「墨韵诗心」，请使用以下验证码完成注册：' },
  reset: { title: '重置密码验证码', lead: '你正在重置「墨韵诗心」账号密码，请使用以下验证码：' },
};

function html(code: string, purpose: MailPurpose) {
  const { title, lead } = COPY[purpose];
  return `
  <div style="margin:0;padding:32px 16px;background:#F5F1E8;font-family:'PingFang SC','Microsoft YaHei',sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#FBF8F1;border:1px solid #E3DCCB;border-radius:12px;overflow:hidden;">
      <div style="padding:22px 28px;border-bottom:1px solid #E9E2D3;">
        <div style="font-size:20px;letter-spacing:4px;color:#2F2C28;">墨 韵 诗 心</div>
        <div style="margin-top:6px;font-size:12px;color:#8A8477;">AI 古诗词文化探索平台</div>
      </div>
      <div style="padding:28px;">
        <div style="font-size:16px;color:#2F2C28;margin-bottom:12px;">${title}</div>
        <div style="font-size:14px;line-height:1.8;color:#5D5853;">${lead}</div>
        <div style="margin:22px 0;padding:16px;text-align:center;background:#F1ECE0;border-radius:8px;">
          <span style="font-size:32px;letter-spacing:10px;font-weight:600;color:#2F2C28;">${code}</span>
        </div>
        <div style="font-size:13px;line-height:1.8;color:#8A8477;">
          验证码 10 分钟内有效，仅可使用一次。<br/>
          若非本人操作，请忽略本邮件，你的账号不会有任何变化。
        </div>
      </div>
      <div style="padding:16px 28px;border-top:1px solid #E9E2D3;font-size:12px;color:#A39C8C;">
        本邮件由系统自动发送，请勿直接回复。
      </div>
    </div>
  </div>`;
}

/** 发送验证码邮件；失败抛出异常由调用方转成用户可读提示 */
export async function sendVerifyCode(to: string, code: string, purpose: MailPurpose): Promise<void> {
  await transport().sendMail({
    from: SMTP_FROM,
    to,
    subject: `【墨韵诗心】${COPY[purpose].title}：${code}`,
    text: `${COPY[purpose].lead}\n\n${code}\n\n验证码 10 分钟内有效，仅可使用一次。若非本人操作请忽略本邮件。`,
    html: html(code, purpose),
  });
}
