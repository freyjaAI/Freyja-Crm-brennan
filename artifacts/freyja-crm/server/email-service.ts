import { Resend } from "resend";

export interface EmailSendRequest {
  from: string;
  to: string;
  subject: string;
  bodyHtml: string;
  replyTo?: string;
  headers?: Record<string, string>;
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
    console.log(`[EmailService:console] TO=${req.to} SUBJ="${req.subject}" ID=${id}`);
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

  async send(req: EmailSendRequest): Promise<EmailSendResult> {
    try {
      const from = req.from || this.defaultFrom;
      const replyTo = req.replyTo || this.defaultReplyTo;

      const { data, error } = await this.client.emails.send({
        from,
        to: [req.to],
        subject: req.subject,
        html: req.bodyHtml,
        ...(replyTo ? { reply_to: [replyTo] } : {}),
        ...(req.headers ? { headers: req.headers } : {}),
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

  return {
    valid: true,
    missing: [],
    config: {
      apiKey: process.env.RESEND_API_KEY!,
      fromEmail: process.env.RESEND_FROM_EMAIL!,
      fromName: process.env.RESEND_FROM_NAME,
      replyTo: process.env.RESEND_REPLY_TO,
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
