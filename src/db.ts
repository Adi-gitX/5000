import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

import { DB_PATH, SYSTEM_DEFAULT_SETTINGS } from './constants.js';
import type { SettingsMap } from './types.js';

const resolvedPath = path.resolve(DB_PATH);
fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });

export const db = new Database(resolvedPath);
db.pragma('journal_mode = WAL');

function ensureColumn(tableName: string, columnDefinition: string): void {
  try {
    db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`);
  } catch {
    // Column already exists; ignore.
  }
}

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
      timezone TEXT DEFAULT '',
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
      timezone TEXT DEFAULT '',
      optout_at TEXT,
      do_not_contact_reason TEXT DEFAULT '',
      suppression_source TEXT DEFAULT '',
      last_error TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE INDEX IF NOT EXISTS idx_leads_next_touch ON leads(next_touch_at);

    CREATE TABLE IF NOT EXISTS outreach_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lead_id TEXT NOT NULL,
      prospect_id TEXT DEFAULT '',
      step TEXT NOT NULL,
      channel TEXT NOT NULL,
      subject TEXT DEFAULT '',
      message TEXT DEFAULT '',
      sent_at TEXT NOT NULL,
      reply_class TEXT DEFAULT '',
      delivery_status TEXT DEFAULT '',
      error_code TEXT DEFAULT '',
      message_id TEXT DEFAULT '',
      provider TEXT DEFAULT '',
      provider_event_id TEXT DEFAULT '',
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

    CREATE TABLE IF NOT EXISTS connector_health (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      connector TEXT UNIQUE NOT NULL,
      status TEXT NOT NULL DEFAULT 'unknown',
      last_checked_at TEXT,
      details TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS job_controls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      job_key TEXT UNIQUE NOT NULL,
      paused INTEGER NOT NULL DEFAULT 0,
      reason TEXT DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS event_feed (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_type TEXT NOT NULL,
      correlation_id TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'info',
      details TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_event_feed_created ON event_feed(created_at);

    CREATE TABLE IF NOT EXISTS manual_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      details TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending',
      owner TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS agent_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT UNIQUE NOT NULL,
      csrf_token TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS workflow_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT UNIQUE NOT NULL,
      event_name TEXT NOT NULL,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      retry_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT DEFAULT CURRENT_TIMESTAMP,
      last_error TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  ensureColumn('leads', "timezone TEXT DEFAULT ''");
  ensureColumn('leads', "suppression_source TEXT DEFAULT ''");
  ensureColumn('lead_intake', "timezone TEXT DEFAULT ''");
  ensureColumn('outreach_log', "prospect_id TEXT DEFAULT ''");
  ensureColumn('outreach_log', "provider TEXT DEFAULT ''");
  ensureColumn('outreach_log', "provider_event_id TEXT DEFAULT ''");

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

export function appendEventFeed(
  eventType: string,
  correlationId: string,
  severity: 'info' | 'warn' | 'error',
  details: string
): void {
  db.prepare('INSERT INTO event_feed (event_type, correlation_id, severity, details) VALUES (?, ?, ?, ?)').run(
    eventType,
    correlationId,
    severity,
    details
  );
}

export function listEventFeed(limit = 100): Array<Record<string, unknown>> {
  return db.prepare('SELECT * FROM event_feed ORDER BY id DESC LIMIT ?').all(limit) as Array<Record<string, unknown>>;
}

export function upsertConnectorHealth(connector: string, status: string, details: string): void {
  db.prepare(
    `INSERT INTO connector_health (connector, status, last_checked_at, details, updated_at)
     VALUES (?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(connector) DO UPDATE SET
       status=excluded.status,
       last_checked_at=excluded.last_checked_at,
       details=excluded.details,
       updated_at=excluded.updated_at`
  ).run(connector, status, details);
}

export function listConnectorHealth(): Array<Record<string, unknown>> {
  return db.prepare('SELECT * FROM connector_health ORDER BY connector ASC').all() as Array<Record<string, unknown>>;
}

export function setJobPaused(jobKey: string, paused: boolean, reason: string): void {
  db.prepare(
    `INSERT INTO job_controls (job_key, paused, reason, updated_at)
     VALUES (?, ?, ?, CURRENT_TIMESTAMP)
     ON CONFLICT(job_key) DO UPDATE SET
       paused=excluded.paused,
       reason=excluded.reason,
       updated_at=excluded.updated_at`
  ).run(jobKey, paused ? 1 : 0, reason);
}

export function isJobPaused(jobKey: string): boolean {
  const row = db.prepare('SELECT paused FROM job_controls WHERE job_key = ? LIMIT 1').get(jobKey) as
    | { paused: number }
    | undefined;
  return Boolean(row?.paused ?? 0);
}

export function listJobControls(): Array<Record<string, unknown>> {
  return db.prepare('SELECT * FROM job_controls ORDER BY job_key ASC').all() as Array<Record<string, unknown>>;
}

export function createManualTask(title: string, details: string, owner = ''): Record<string, unknown> {
  db.prepare(
    'INSERT INTO manual_tasks (title, details, status, owner, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)'
  ).run(title, details, 'pending', owner);
  return db.prepare('SELECT * FROM manual_tasks ORDER BY id DESC LIMIT 1').get() as Record<string, unknown>;
}

export function updateManualTask(
  id: number,
  patch: { status?: string; details?: string; owner?: string }
): Record<string, unknown> | null {
  const existing = db.prepare('SELECT * FROM manual_tasks WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!existing) {
    return null;
  }

  db.prepare(
    `UPDATE manual_tasks
     SET status=?, details=?, owner=?, updated_at=CURRENT_TIMESTAMP
     WHERE id=?`
  ).run(
    patch.status ?? String(existing.status ?? 'pending'),
    patch.details ?? String(existing.details ?? ''),
    patch.owner ?? String(existing.owner ?? ''),
    id
  );

  return db.prepare('SELECT * FROM manual_tasks WHERE id = ?').get(id) as Record<string, unknown>;
}

export function listManualTasks(limit = 200): Array<Record<string, unknown>> {
  return db.prepare('SELECT * FROM manual_tasks ORDER BY id DESC LIMIT ?').all(limit) as Array<Record<string, unknown>>;
}

export function createAgentSession(sessionId: string, csrfToken: string, expiresAtIso: string): void {
  db.prepare('DELETE FROM agent_sessions WHERE expires_at <= CURRENT_TIMESTAMP').run();
  db.prepare('INSERT INTO agent_sessions (session_id, csrf_token, expires_at) VALUES (?, ?, ?)').run(
    sessionId,
    csrfToken,
    expiresAtIso
  );
}

export function getAgentSession(sessionId: string): { session_id: string; csrf_token: string; expires_at: string } | null {
  const row = db
    .prepare('SELECT session_id, csrf_token, expires_at FROM agent_sessions WHERE session_id = ? LIMIT 1')
    .get(sessionId) as { session_id: string; csrf_token: string; expires_at: string } | undefined;
  if (!row) {
    return null;
  }

  if (new Date(row.expires_at).getTime() <= Date.now()) {
    db.prepare('DELETE FROM agent_sessions WHERE session_id = ?').run(sessionId);
    return null;
  }

  return row;
}

export function deleteAgentSession(sessionId: string): void {
  db.prepare('DELETE FROM agent_sessions WHERE session_id = ?').run(sessionId);
}

export function queueWorkflowEvent(eventId: string, eventName: string, payload: string): void {
  db.prepare(
    `INSERT INTO workflow_events (event_id, event_name, payload, status, retry_count, next_attempt_at, last_error, created_at, updated_at)
     VALUES (?, ?, ?, 'queued', 0, CURRENT_TIMESTAMP, '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT(event_id) DO NOTHING`
  ).run(eventId, eventName, payload);
}

export function listPendingWorkflowEvents(limit = 50): Array<Record<string, unknown>> {
  return db
    .prepare(
      `SELECT * FROM workflow_events
       WHERE status IN ('queued', 'retry')
         AND next_attempt_at <= CURRENT_TIMESTAMP
       ORDER BY id ASC
       LIMIT ?`
    )
    .all(limit) as Array<Record<string, unknown>>;
}

export function markWorkflowEventSuccess(id: number): void {
  db.prepare(
    `UPDATE workflow_events
     SET status='sent', updated_at=CURRENT_TIMESTAMP, last_error=''
     WHERE id=?`
  ).run(id);
}

export function markWorkflowEventRetry(id: number, retryCount: number, nextAttemptIso: string, errorText: string): void {
  db.prepare(
    `UPDATE workflow_events
     SET status='retry', retry_count=?, next_attempt_at=?, last_error=?, updated_at=CURRENT_TIMESTAMP
     WHERE id=?`
  ).run(retryCount, nextAttemptIso, errorText, id);
}
