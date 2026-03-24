import type { Request, Response, NextFunction } from "express";

const ADMIN_EMAIL = "admin@freyja.biz";
const ADMIN_PASSWORD = "Freyja.123!";

declare module "express-session" {
  interface SessionData {
    authenticated: boolean;
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
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
      req.session.authenticated = true;
      res.json({ ok: true });
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
      res.json({ email: ADMIN_EMAIL });
    } else {
      res.status(401).json({ error: "Unauthorized" });
    }
  });
}
