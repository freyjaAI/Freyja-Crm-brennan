import { Resend } from "resend";
import crypto from "crypto";

const UNSUB_SECRET = process.env.RESEND_API_KEY || "freyja-unsub-default-key";

export function generateUnsubToken(email: string): string {
  return crypto.createHmac("sha256", UNSUB_SECRET).update(email.toLowerCase().trim()).digest("hex").slice(0, 32);
}

export function verifyUnsubToken(email: string, token: string): boolean {
  return generateUnsubToken(email) === token;
}

function buildUnsubUrl(recipientEmail: string): string {
  const token = generateUnsubToken(recipientEmail);
  const domain = process.env.UNSUB_DOMAIN || "freyja-crm.replit.app";
  return `https://${domain}/api/outreach/unsubscribe?email=${encodeURIComponent(recipientEmail)}&token=${token}`;
}

function appendUnsubscribeFooter(bodyHtml: string, recipientEmail: string): string {
  const unsubUrl = buildUnsubUrl(recipientEmail);
  const footer = `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e5e5;font-size:11px;color:#999;line-height:1.6;">If you'd rather not hear from us, reply STOP or <a href="${unsubUrl}" style="color:#999;text-decoration:underline;">click here to unsubscribe</a>.</div>`;
  return bodyHtml + footer;
}

export interface EmailSendRequest {
  from: string;
  to: string;
  subject: string;
  bodyHtml: string;
  replyTo?: string;
  headers?: Record<string, string>;
  skipUnsubFooter?: boolean;
}

export interface EmailSendResult {
  success: boolean;
  providerMessageId?: string;
  error?: string;
}

export interface IEmailService {
  send(req: EmailSendRequest): Promise<EmailSendResult>;
  name(): string;
}

export class ConsoleEmailService implements IEmailService {
  name() {
    return "console";
  }
  async send(req: EmailSendRequest): Promise<EmailSendResult> {
    const id = `console_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const finalBody = req.skipUnsubFooter ? req.bodyHtml : appendUnsubscribeFooter(req.bodyHtml, req.to);
    console.log(`[EmailService:console] TO=${req.to} SUBJ="${req.subject}" ID=${id} bodyLen=${finalBody.length}`);
    return { success: true, providerMessageId: id };
  }
}

export class ResendEmailService implements IEmailService {
  private client: Resend;
  private defaultFrom: string;
  private defaultReplyTo: string | undefined;

  constructor(apiKey: string, defaultFrom: string, defaultReplyTo?: string) {
    this.client = new Resend(apiKey);
    this.defaultFrom = defaultFrom;
    this.defaultReplyTo = defaultReplyTo;
  }

  name() {
    return "resend";
  }

  getResendClient() {
    return this.client;
  }

  async send(req: EmailSendRequest): Promise<EmailSendResult> {
    try {
      const from = req.from || this.defaultFrom;
      const replyTo = req.replyTo || this.defaultReplyTo;
      const finalBody = req.skipUnsubFooter ? req.bodyHtml : appendUnsubscribeFooter(req.bodyHtml, req.to);

      const unsubUrl = buildUnsubUrl(req.to);
      const mergedHeaders: Record<string, string> = {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        ...(req.headers || {}),
      };

      const { data, error } = await this.client.emails.send({
        from,
        to: [req.to],
        subject: req.subject,
        html: finalBody,
        ...(replyTo ? { reply_to: [replyTo] } : {}),
        headers: mergedHeaders,
        tracking: {
          opens: true,
          clicks: true,
        },
      });

      if (error) {
        console.error(`[EmailService:resend] FAIL TO=${req.to} ERR=${error.message}`);
        return { success: false, error: error.message };
      }

      console.log(`[EmailService:resend] SENT TO=${req.to} ID=${data?.id}`);
      return { success: true, providerMessageId: data?.id };
    } catch (err: any) {
      console.error(`[EmailService:resend] EXCEPTION TO=${req.to} ERR=${err.message}`);
      return { success: false, error: err.message };
    }
  }
}

let activeService: IEmailService = new ConsoleEmailService();

export function getEmailService(): IEmailService {
  return activeService;
}

export function setEmailService(svc: IEmailService) {
  activeService = svc;
}

export interface ResendEnvConfig {
  apiKey: string;
  fromEmail: string;
  fromName?: string;
  replyTo?: string;
}

export function validateResendEnv(): { valid: boolean; config?: ResendEnvConfig; missing: string[] } {
  const required: Record<string, string | undefined> = {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
  };

  const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) {
    return { valid: false, missing };
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || "admin@freyjaiq.com";

  return {
    valid: true,
    missing: [],
    config: {
      apiKey: process.env.RESEND_API_KEY!,
      fromEmail,
      fromName: process.env.RESEND_FROM_NAME,
      replyTo: process.env.RESEND_REPLY_TO || "factored@freyjafinancialgroup.net",
    },
  };
}

export function initResendEmailService(): boolean {
  const { valid, config, missing } = validateResendEnv();
  if (!valid) {
    console.warn(`[EmailService] Resend NOT configured — missing env vars: ${missing.join(", ")}. Falling back to console logger.`);
    return false;
  }

  const fromAddr = config!.fromName
    ? `${config!.fromName} <${config!.fromEmail}>`
    : config!.fromEmail;

  const svc = new ResendEmailService(config!.apiKey, fromAddr, config!.replyTo);
  setEmailService(svc);
  console.log(`[EmailService] Resend ACTIVE — from=${fromAddr}${config!.replyTo ? ` replyTo=${config!.replyTo}` : ""}`);
  return true;
}
