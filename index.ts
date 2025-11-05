import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import passport from "passport";
import { Strategy as LocalStrategy } from "passport-local";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { storage } from "./storage";
import { pool } from "./db";
import bcrypt from "bcryptjs";
import cors from "cors";
import type { User } from "@shared/schema";

const app = express();

// CORS configuration for iframe/cross-origin cookies
app.use(cors({
  origin: true, // Allow all origins (Replit webview)
  credentials: true, // CRITICAL: Allow credentials (cookies)
}));

declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}

// CRITICAL: Body parser MUST come BEFORE session
// Increased limit for base64 image uploads (reference images, upscaling)
app.use(express.json({
  limit: '50mb', // Support large base64 images
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// PostgreSQL session store for persistent sessions
const PgSession = connectPgSimple(session);

// Session configuration with PostgreSQL store
// Replit runs in iframe, so we need sameSite: 'none' with secure: true
const isReplit = !!process.env.REPL_ID;
console.log('[SESSION CONFIG] Environment:', process.env.NODE_ENV || 'not set');
console.log('[SESSION CONFIG] Is Replit:', isReplit);
console.log('[SESSION CONFIG] Cookie settings:', isReplit ? 'secure + sameSite:none (iframe)' : 'lax (local)');

app.use(session({
  store: new PgSession({
    pool: pool,
    tableName: 'session',
    createTableIfMissing: true,
  }),
  secret: process.env.SESSION_SECRET || 'vivid-vixen-secret-key-change-in-production',
  resave: false,
  saveUninitialized: true, // Changed to true to force cookie creation
  name: 'vivid.sid',
  proxy: true, // Trust proxy headers
  cookie: {
    secure: isReplit, // true for Replit (HTTPS), false for local dev
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    sameSite: isReplit ? 'none' : 'lax', // 'none' required for iframe
    path: '/',
    domain: undefined, // Let browser decide
  },
}));

// Passport configuration
passport.use(new LocalStrategy(
  { usernameField: 'email' },
  async (email, password, done) => {
    try {
      const user = await storage.getUserByEmail(email);
      if (!user) {
        return done(null, false, { message: 'Invalid credentials' });
      }
      
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        return done(null, false, { message: 'Invalid credentials' });
      }
      
      return done(null, user);
    } catch (error) {
      return done(error);
    }
  }
));

passport.serializeUser((user: any, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id: string, done) => {
  try {
    console.log('[PASSPORT] Deserializing user, ID:', id);
    const user = await storage.getUser(id);
    console.log('[PASSPORT] User found:', user ? user.email : 'null');
    done(null, user);
  } catch (error) {
    console.error('[PASSPORT] Deserialize error:', error);
    done(error);
  }
});

app.use(passport.initialize());
app.use(passport.session());

// Debug session middleware
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    console.log(`[SESSION DEBUG] ${req.method} ${req.path}`);
    console.log(`  Session ID: ${req.sessionID}`);
    console.log(`  Session data:`, JSON.stringify(req.session));
    console.log(`  Authenticated: ${req.isAuthenticated()}`);
    console.log(`  User: ${req.user ? (req.user as any).email : 'none'}`);
    console.log(`  Cookie header: ${req.headers.cookie || 'NONE'}`);
  }
  next();
});

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

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    // Only send response if headers haven't been sent yet
    if (!res.headersSent) {
      res.status(status).json({ message });
    }
    
    // Log error but don't throw again
    console.error('Error:', err);
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
  });
})();
