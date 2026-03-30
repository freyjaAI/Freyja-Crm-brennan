import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import { registerRoutes } from "./routes";
import { registerAuthRoutes } from "./auth";
import { serveStatic } from "./static";
import { createServer } from "http";
import { initResendEmailService, getEmailService } from "./email-service";
import { sendDueEmails } from "./outreach-service";
import { db } from "./storage";
import { senderInboxes, emailMessages, outreachLog } from "@shared/schema";
import { eq, sql } from "drizzle-orm";

const app = express();
const httpServer = createServer(app);

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  session({
    secret: "freyja-crm-session-secret-2024",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 8 * 60 * 60 * 1000 },
  })
);

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));
app.use(express.text({ type: "text/csv", limit: "50mb" }));

registerAuthRoutes(app);

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  initResendEmailService();
  console.log(`[Startup] Active email provider: ${getEmailService().name()}`);

  await registerRoutes(httpServer, app);

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(
    {
      port,
      host: "0.0.0.0",
      reusePort: true,
    },
    () => {
      log(`serving on port ${port}`);

      (async () => {
        try {
          const existingInboxes = await db.select().from(senderInboxes).limit(1);
          if (existingInboxes.length === 0) {
            const fromEmail = process.env.RESEND_FROM_EMAIL || "admin@freyjaiq.com";
            const fromName = process.env.RESEND_FROM_NAME || "Freyja IQ";
            await db.insert(senderInboxes).values({
              label: `${fromName} Primary`,
              email_address: fromEmail,
              daily_limit: 48,
              active: true,
              created_at: new Date().toISOString(),
            });
            log(`[Startup] Created default sender inbox: ${fromName} <${fromEmail}>`);
          }
          await db.execute(sql`UPDATE outreach_log SET status = 'contacted' WHERE status = 'sent'`);
          await db.execute(sql`
            INSERT INTO outreach_log (broker_id, outreach_type, message_template_used, status, notes, created_at)
            SELECT em.entity_id, 'email', em.subject, 'contacted',
              'Sequence "' || COALESCE(oe.sequence_id::text,'?') || '" step ' || COALESCE(oe.current_step::text,'1') || ' — ' || COALESCE(em.provider_message_id,''),
              em.sent_at
            FROM email_messages em
            LEFT JOIN outreach_enrollments oe ON oe.id = em.enrollment_id
            WHERE em.send_status = 'sent'
              AND em.entity_id > 0
              AND em.sent_at IS NOT NULL
              AND em.provider_message_id IS NOT NULL
              AND NOT EXISTS (
                SELECT 1 FROM outreach_log ol
                WHERE ol.broker_id = em.entity_id
                  AND ol.outreach_type = 'email'
                  AND ol.notes LIKE '%' || em.provider_message_id
              )
          `);
          log(`[Startup] Backfilled outreach_log from email_messages`);
        } catch (err: any) {
          log(`[Startup] Startup setup error: ${err.message}`);
        }
      })();

      const enableAutoSend =
        process.env.NODE_ENV === "production" ||
        process.env.ENABLE_AUTO_SEND === "true";

      if (enableAutoSend) {
        const THIRTY_MINUTES = 30 * 60 * 1000;
        let cronRunning = false;
        log("[AutoSend] Cron enabled — running every 30 minutes, 1 email per run");

        const runAutoSend = async () => {
          if (cronRunning) {
            log("[AutoSend] Previous run still in progress — skipping");
            return;
          }
          cronRunning = true;
          const ts = new Date().toISOString();
          try {
            const result = await sendDueEmails(undefined, 1);
            log(`[AutoSend] ${ts} — sent: ${result.sent}, errors: ${result.errors}, skipped: ${result.skipped}`);
            if (result.details.length > 0) {
              for (const d of result.details) {
                log(`[AutoSend]   enrollment=${d.enrollmentId} status=${d.status}${d.error ? ` error=${d.error}` : ""}`);
              }
            }
          } catch (err: any) {
            log(`[AutoSend] ${ts} — cron error: ${err.message}`);
          } finally {
            cronRunning = false;
          }
        };
        setTimeout(runAutoSend, 5000);
        setInterval(runAutoSend, THIRTY_MINUTES);
      } else {
        log("[AutoSend] Cron disabled — set NODE_ENV=production or ENABLE_AUTO_SEND=true to enable");
      }
    },
  );
})();
