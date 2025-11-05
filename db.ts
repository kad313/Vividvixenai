import { drizzle } from "drizzle-orm/neon-http";
import { neon, Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is not set");
}

// Configure WebSocket for Node.js environments (required for Pool)
neonConfig.webSocketConstructor = ws;

// Use HTTP client for better compatibility (no WebSocket issues)
const sql = neon(process.env.DATABASE_URL);
export const db = drizzle(sql, { schema });

// Pool connection for session store (uses WebSocket)
export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
