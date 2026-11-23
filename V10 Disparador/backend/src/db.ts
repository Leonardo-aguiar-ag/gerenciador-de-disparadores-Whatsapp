// @ts-nocheck
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const now = () => new Date().toISOString();
export const makeId = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

export function normalizePhone(value: unknown, defaultCountry = process.env.DEFAULT_COUNTRY || '55') {
  let digits = String(value ?? '').replace(/\D/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = defaultCountry + digits.slice(1);
  if (digits.length >= 10 && digits.length <= 11) digits = defaultCountry + digits;
  return digits;
}

export function isValidPhone(value: unknown) { return /^\d{12,15}$/.test(normalizePhone(value)); }

export function createDb(filename = process.env.DB_FILE || path.join(process.cwd(), 'data/v10.sqlite')) {
  const resolved = path.resolve(filename);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  const db = new DatabaseSync(resolved);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY, phone TEXT UNIQUE NOT NULL, name TEXT NOT NULL DEFAULT '', fields TEXT NOT NULL DEFAULT '{}', tags TEXT NOT NULL DEFAULT '[]', funnel_stage TEXT NOT NULL DEFAULT 'novo', opted_out INTEGER NOT NULL DEFAULT 0, consent_source TEXT, consent_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS campaigns (id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', mode TEXT NOT NULL DEFAULT 'simulation', body TEXT NOT NULL DEFAULT '', config TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS script_versions (id TEXT PRIMARY KEY, script_id TEXT NOT NULL, version INTEGER NOT NULL, name TEXT NOT NULL, content TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(script_id, version));
    CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, campaign_id TEXT, contact_id TEXT, to_phone TEXT NOT NULL, body TEXT NOT NULL, mode TEXT NOT NULL DEFAULT 'simulation', state TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, max_attempts INTEGER NOT NULL DEFAULT 3, next_attempt_at TEXT, provider_message_id TEXT, event_id TEXT UNIQUE, error TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, locked_at TEXT);
    CREATE TABLE IF NOT EXISTS opt_outs (id TEXT PRIMARY KEY, phone TEXT UNIQUE NOT NULL, reason TEXT NOT NULL, source TEXT NOT NULL DEFAULT 'manual', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit_logs (id TEXT PRIMARY KEY, level TEXT NOT NULL, event TEXT NOT NULL, details TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS webhook_events (event_id TEXT PRIMARY KEY, payload TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS backups (id TEXT PRIMARY KEY, file_path TEXT NOT NULL, created_at TEXT NOT NULL, size_bytes INTEGER NOT NULL DEFAULT 0);
    CREATE INDEX IF NOT EXISTS idx_messages_queue ON messages(state, next_attempt_at);
    CREATE INDEX IF NOT EXISTS idx_contacts_stage ON contacts(funnel_stage);
  `);
  const migration = db.prepare('SELECT version FROM schema_migrations WHERE version = 1').get();
  if (!migration) db.prepare('INSERT INTO schema_migrations(version, applied_at) VALUES(1, ?)').run(now());
  return db;
}

export function json(value: unknown) { return JSON.stringify(value ?? {}); }
export function parse<T = any>(value: string | null | undefined, fallback: T): T { try { return value ? JSON.parse(value) : fallback; } catch { return fallback; } }
export function log(db: any, level: string, event: string, details: unknown = {}) { db.prepare('INSERT INTO audit_logs(id,level,event,details,created_at) VALUES(?,?,?,?,?)').run(makeId('log'), level, event, json(details), now()); }
