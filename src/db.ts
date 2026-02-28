import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

import { DB_PATH, SYSTEM_DEFAULT_SETTINGS } from './constants.js';
import type { SettingsMap } from './types.js';

const resolvedPath = path.resolve(DB_PATH);
fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

export const db = new Database(resolvedPath);
db.pragma('journal_mode = WAL');

export function initializeDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS lead_intake (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT,
      business_name TEXT NOT NULL,
      niche TEXT DEFAULT 'med spa',
      city TEXT DEFAULT '',
      website TEXT DEFAULT '',
      email TEXT NOT NULL,
      linkedin_url TEXT DEFAULT '',
      pain_signal TEXT DEFAULT '',
      owner TEXT DEFAULT '',
      source TEXT DEFAULT 'manual',
      processed_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT UNIQUE NOT NULL,
      business_name TEXT NOT NULL,
      niche TEXT DEFAULT 'med spa',
      city TEXT DEFAULT '',
      website TEXT DEFAULT '',
      email TEXT NOT NULL,
      linkedin_url TEXT DEFAULT '',
      pain_signal TEXT DEFAULT '',
      status TEXT NOT NULL,
      last_touch_at TEXT,
      next_touch_at TEXT,
      owner TEXT DEFAULT '',
      optout_at TEXT,
      do_not_contact_reason TEXT DEFAULT '',
      last_error TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_next_touch ON leads(next_touch_at);

    CREATE TABLE IF NOT EXISTS outreach_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL,
      step TEXT NOT NULL,
      channel TEXT NOT NULL,
      subject TEXT DEFAULT '',
      message TEXT DEFAULT '',
      sent_at TEXT NOT NULL,
      reply_class TEXT DEFAULT '',
      delivery_status TEXT DEFAULT '',
      error_code TEXT DEFAULT '',
      message_id TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_outreach_sent_at ON outreach_log(sent_at);
    CREATE INDEX IF NOT EXISTS idx_outreach_step ON outreach_log(step);

    CREATE TABLE IF NOT EXISTS replies_inbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reply_id TEXT UNIQUE NOT NULL,
      prospect_id TEXT DEFAULT '',
      email TEXT NOT NULL,
      body TEXT NOT NULL,
      received_at TEXT NOT NULL,
      processed_at TEXT,
      reply_class TEXT DEFAULT '',
      message_id TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS deals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deal_id TEXT UNIQUE NOT NULL,
      lead_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      quoted_price REAL DEFAULT 1500,
      close_by TEXT DEFAULT '',
      objection_code TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id TEXT UNIQUE NOT NULL,
      deal_id TEXT DEFAULT '',
      amount REAL NOT NULL,
      status TEXT NOT NULL,
      paid_at TEXT NOT NULL,
      stripe_event_id TEXT UNIQUE NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS delivery (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id TEXT UNIQUE NOT NULL,
      assets_received TEXT DEFAULT 'pending',
      workflow_deployed TEXT DEFAULT 'pending',
      qa_status TEXT DEFAULT 'pending',
      handoff_status TEXT DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS job_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name TEXT NOT NULL,
      status TEXT NOT NULL,
      details TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const settingStmt = db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (@key, @value, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO NOTHING`
  );

  const insertMany = db.transaction((entries: Array<{ key: string; value: string }>) => {
    for (const entry of entries) {
      settingStmt.run(entry);
    }
  });

  insertMany(Object.entries(SYSTEM_DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })));
}

export function getSettings(): SettingsMap {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Array<{ key: string; value: string }>;
  const map: SettingsMap = { ...SYSTEM_DEFAULT_SETTINGS };
  for (const row of rows) {
    map[row.key] = row.value;
  }
  return map;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`
  ).run(key, value);
}

export function setManySettings(payload: Record<string, string>): void {
  const stmt = db.prepare(
    `INSERT INTO settings (key, value, updated_at)
     VALUES (@key, @value, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP`
  );

  const tx = db.transaction((items: Array<{ key: string; value: string }>) => {
    for (const item of items) {
      stmt.run(item);
    }
  });

  tx(Object.entries(payload).map(([key, value]) => ({ key, value })));
}

export function logJobRun(jobName: string, status: 'success' | 'error', details: string): void {
  db.prepare('INSERT INTO job_runs (job_name, status, details) VALUES (?, ?, ?)').run(jobName, status, details);
}
