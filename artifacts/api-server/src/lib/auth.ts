import type { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";

let _supabase: ReturnType<typeof createClient> | null = null;
const AUTH_CACHE_TTL_MS = 5 * 60 * 1000;
const authCache = new Map<string, number>();

function getSupabaseAdmin(): ReturnType<typeof createClient> | null {
  const url = process.env["SUPABASE_URL"] ?? "";
  const key = process.env["SUPABASE_SERVICE_ROLE_KEY"] ?? "";
  if (!url || !key) return null;
  if (!_supabase) {
    _supabase = createClient(url, key, { auth: { persistSession: false } });
  }
  return _supabase;
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    req.log?.warn({}, "SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured — rejecting AI request");
    res.status(503).json({ error: "AI service not available" });
    return;
  }

  const authHeader = req.headers["authorization"] ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const cachedUntil = authCache.get(token);
  if (cachedUntil && cachedUntil > Date.now()) {
    next();
    return;
  }

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    authCache.delete(token);
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  authCache.set(token, Date.now() + AUTH_CACHE_TTL_MS);
  next();
}
