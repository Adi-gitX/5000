import { db, getSettings, listConnectorHealth, listEventFeed, listJobControls, listManualTasks, setJobPaused, upsertConnectorHealth } from '../db.js';
import { runJobByName } from './automationService.js';
import { generateTextWithFallback } from './modelRouter.js';

export const AGENT_JOB_CATALOG = [
  { key: 'prospecting', executeAs: 'prospecting', label: 'Prospecting Batch' },
  { key: 'outreach', executeAs: 'outreach', label: 'Outreach Batch' },
  { key: 'follow-up', executeAs: 'followups', label: 'Follow-up Batch' },
  { key: 'triage', executeAs: 'reply-triage', label: 'Reply Triage' },
  { key: 'digest', executeAs: 'digest', label: 'Pipeline Digest' },
  { key: 'onboarding', executeAs: 'workflow-dispatch', label: 'Onboarding Workflow Dispatch' }
] as const;

function getConnectorList(): string[] {
  return ['stripe', 'calendly', 'gmail', 'n8n', 'openclaw', 'openai'];
}

function asUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

async function pingUrl(url: string): Promise<{ ok: boolean; details: string }> {
  const endpoint = asUrl(url);
  if (!endpoint) {
    return { ok: false, details: 'invalid_url' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(endpoint.toString(), {
      method: 'HEAD',
      signal: controller.signal
    });
    clearTimeout(timeout);
    return {
      ok: res.status < 500,
      details: `status=${res.status}`
    };
  } catch (error) {
    return { ok: false, details: String(error) };
  }
}

function getJobControlsMap(): Record<string, { paused: boolean; reason: string; updated_at: string }> {
  const rows = listJobControls();
  const out: Record<string, { paused: boolean; reason: string; updated_at: string }> = {};
  for (const row of rows) {
    const key = String(row.job_key || '');
    out[key] = {
      paused: Boolean(row.paused),
      reason: String(row.reason || ''),
      updated_at: String(row.updated_at || '')
    };
  }
  return out;
}

export async function testConnector(connector: string): Promise<Record<string, unknown>> {
  const normalized = connector.toLowerCase();
  const settings = getSettings();

  let status = 'healthy';
  let details = 'ok';

  if (!getConnectorList().includes(normalized)) {
    throw new Error(`Unsupported connector: ${connector}`);
  }

  if (normalized === 'stripe') {
    const hasLinks = Boolean(settings.STRIPE_DEPOSIT_LINK && asUrl(settings.STRIPE_DEPOSIT_LINK));
    const hasToken = Boolean(settings.STRIPE_WEBHOOK_TOKEN);
    status = hasLinks && hasToken ? 'healthy' : 'unconfigured';
    details = hasLinks && hasToken ? 'configured' : 'missing_link_or_token';
  } else if (normalized === 'calendly') {
    const hasLink = Boolean(settings.CALENDLY_LINK && asUrl(settings.CALENDLY_LINK));
    status = hasLink ? 'healthy' : 'unconfigured';
    details = hasLink ? 'configured' : 'missing_calendly_link';
  } else if (normalized === 'gmail') {
    const hasSmtp = Boolean(settings.SMTP_HOST && settings.SMTP_PORT && settings.SMTP_USER && settings.SMTP_PASS);
    status = hasSmtp ? 'healthy' : 'unconfigured';
    details = hasSmtp ? 'smtp_config_present' : 'smtp_missing_fields';
  } else if (normalized === 'n8n') {
    const base = settings.N8N_WEBHOOK_BASE || settings.N8N_WEBHOOK_URL;
    if (!base) {
      status = 'unconfigured';
      details = 'missing_n8n_webhook_base';
    } else {
      const ping = await pingUrl(base);
      status = ping.ok ? 'healthy' : 'degraded';
      details = ping.details;
    }
  } else if (normalized === 'openclaw') {
    if (!settings.OPENCLAW_API_KEY) {
      status = 'unconfigured';
      details = 'missing_openclaw_api_key';
    } else {
      const out = await generateTextWithFallback(
        'Reply with {"ok":true}',
        'Return short valid JSON only.',
        {
          ...settings,
          MODEL_PROVIDER_CHAIN: 'openclaw'
        }
      );
      status = out.fallbackUsed ? 'degraded' : 'healthy';
      details = out.fallbackUsed ? 'fallback_used' : `provider=${out.providerUsed}`;
    }
  } else if (normalized === 'openai') {
    if (!settings.OPENAI_API_KEY) {
      status = 'unconfigured';
      details = 'missing_openai_api_key';
    } else {
      const out = await generateTextWithFallback(
        'Reply with {"ok":true}',
        'Return short valid JSON only.',
        {
          ...settings,
          MODEL_PROVIDER_CHAIN: 'openai'
        }
      );
      status = out.fallbackUsed ? 'degraded' : 'healthy';
      details = out.fallbackUsed ? 'fallback_used' : `provider=${out.providerUsed}`;
    }
  }

  upsertConnectorHealth(normalized, status, details);
  return {
    connector: normalized,
    status,
    details,
    checked_at: new Date().toISOString()
  };
}

export function getConnectors(): Array<Record<string, unknown>> {
  const persisted = listConnectorHealth();
  const byName = new Map(persisted.map((x) => [String(x.connector), x]));
  return getConnectorList().map((connector) => {
    return byName.get(connector) || {
      connector,
      status: 'unknown',
      details: 'not_tested',
      last_checked_at: null
    };
  });
}

export async function runAgentJob(jobKey: string): Promise<Record<string, unknown>> {
  const normalized = jobKey.toLowerCase();
  const mapping = AGENT_JOB_CATALOG.find((x) => x.key === normalized);
  if (!mapping) {
    throw new Error(`Unknown job key: ${jobKey}`);
  }

  const result = await runJobByName(mapping.executeAs);
  return {
    job_key: normalized,
    result
  };
}

export function pauseAgentJob(jobKey: string, paused: boolean, reason: string): Record<string, unknown> {
  const normalized = jobKey.toLowerCase();
  const mapping = AGENT_JOB_CATALOG.find((x) => x.key === normalized);
  if (!mapping) {
    throw new Error(`Unknown job key: ${jobKey}`);
  }

  setJobPaused(mapping.executeAs, paused, reason);
  return {
    job_key: normalized,
    paused,
    reason
  };
}

export function listAgentJobs(): Array<Record<string, unknown>> {
  const controls = getJobControlsMap();
  const latestRuns = db
    .prepare(
      `SELECT job_name, status, details, created_at
       FROM job_runs
       WHERE id IN (SELECT MAX(id) FROM job_runs GROUP BY job_name)`
    )
    .all() as Array<{ job_name: string; status: string; details: string; created_at: string }>;

  const latestByName = new Map(latestRuns.map((x) => [x.job_name, x]));
  return AGENT_JOB_CATALOG.map((job) => {
    const control = controls[job.executeAs] || { paused: false, reason: '', updated_at: '' };
    const latest = latestByName.get(job.executeAs) || latestByName.get(job.key);
    return {
      key: job.key,
      execute_as: job.executeAs,
      label: job.label,
      paused: control.paused,
      pause_reason: control.reason,
      pause_updated_at: control.updated_at || '',
      last_status: latest?.status || 'never',
      last_details: latest?.details || '',
      last_run_at: latest?.created_at || ''
    };
  });
}

export function getAgentsOverview(): Record<string, unknown> {
  const metrics = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM leads) AS total_leads,
         (SELECT COUNT(*) FROM leads WHERE status IN ('suppressed_optout', 'suppressed_bounce')) AS suppressed,
         (SELECT COUNT(*) FROM leads WHERE status='positive_reply') AS positive_replies,
         (SELECT COALESCE(SUM(amount), 0) FROM payments WHERE status='paid') AS cash_collected`
    )
    .get() as {
    total_leads: number;
    suppressed: number;
    positive_replies: number;
    cash_collected: number;
  };

  const todaySends = (db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM outreach_log
       WHERE date(sent_at) = date('now')
         AND step IN ('step_1', 'step_2', 'step_3')`
    )
    .get() as { c: number }).c;

  return {
    metrics: {
      totalLeads: Number(metrics.total_leads || 0),
      suppressed: Number(metrics.suppressed || 0),
      sendsToday: Number(todaySends || 0),
      positiveReplies: Number(metrics.positive_replies || 0),
      cashCollected: Number(metrics.cash_collected || 0)
    },
    connectors: getConnectors(),
    jobs: listAgentJobs(),
    manual_tasks: listManualTasks(50),
    events: listEventFeed(50)
  };
}

export function appendAgentEvent(eventType: string, correlationId: string, details: string): void {
  const severity: 'info' | 'warn' | 'error' =
    eventType.includes('error') || eventType.includes('failed') ? 'error' : 'info';
  db.prepare('INSERT INTO event_feed (event_type, correlation_id, severity, details) VALUES (?, ?, ?, ?)').run(
    eventType,
    correlationId,
    severity,
    details
  );
}
