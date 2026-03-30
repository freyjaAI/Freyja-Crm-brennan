import type { Request, Response, NextFunction } from "express";

const USERS: { email: string; password: string }[] = [
  { email: "admin@freyja.biz", password: "Freyja.123!" },
  { email: "manus@freyja.biz", password: "Manus123" },
];

declare module "express-session" {
  interface SessionData {
    authenticated: boolean;
    userEmail: string;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (req.session.authenticated) {
    return next();
  }
  res.status(401).json({ error: "Unauthorized" });
}

export function registerAuthRoutes(app: import("express").Express) {
  app.post("/api/login", (req, res) => {
    const { email, password } = req.body;
    const user = USERS.find(u => u.email.toLowerCase() === email?.toLowerCase() && u.password === password);
    if (user) {
      req.session.authenticated = true;
      req.session.userEmail = user.email;
      req.session.save((err) => {
        if (err) {
          console.error("[Auth] Session save error:", err);
          return res.status(500).json({ error: "Session error" });
        }
        res.json({ ok: true });
      });
    } else {
      res.status(401).json({ error: "Invalid email or password" });
    }
  });

  app.post("/api/logout", (req, res) => {
    req.session.destroy(() => {});
    res.json({ ok: true });
  });

  app.get("/api/me", (req, res) => {
    if (req.session.authenticated) {
      res.json({ email: req.session.userEmail });
    } else {
      res.status(401).json({ error: "Unauthorized" });
    }
  });
}
