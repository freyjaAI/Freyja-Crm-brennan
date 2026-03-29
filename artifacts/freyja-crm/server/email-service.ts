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

export class SmtpEmailService implements IEmailService {
  name() {
    return "smtp";
  }
  async send(_req: EmailSendRequest): Promise<EmailSendResult> {
    return { success: false, error: "SMTP not configured yet" };
  }
}

let activeService: IEmailService = new ConsoleEmailService();

export function getEmailService(): IEmailService {
  return activeService;
}

export function setEmailService(svc: IEmailService) {
  activeService = svc;
}
