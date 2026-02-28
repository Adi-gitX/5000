import { createHmac } from 'node:crypto';

import {
  appendEventFeed,
  getWorkflowEvent,
  listPendingWorkflowEvents,
  markWorkflowEventCallback,
  markWorkflowEventRetry,
  markWorkflowEventSuccess,
  queueWorkflowEvent
} from '../db.js';
import type { SettingsMap } from '../types.js';
import { buildId } from '../utils.js';

export type IntegrationDispatchResult = {
  target: 'n8n' | 'make';
  success: boolean;
  status?: number;
  error?: string;
};

type WorkflowEnvelope = {
  event_id: string;
  event_name: string;
  occurred_at: string;
  payload: Record<string, unknown>;
};

type WorkflowCallbackPayload = {
  event_id: string;
  status: string;
  details?: string;
};

function resolveN8nEndpoint(eventName: string, settings: SettingsMap): string {
  if (settings.N8N_WEBHOOK_URL) {
    return settings.N8N_WEBHOOK_URL;
  }
  if (settings.N8N_WEBHOOK_BASE) {
    return `${settings.N8N_WEBHOOK_BASE.replace(/\/$/, '')}/${eventName}`;
  }
  return '';
}

function hmacSignature(secret: string, timestamp: string, body: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
}

async function postJsonSigned(
  url: string,
  payload: unknown,
  settings: SettingsMap,
  eventId: string
): Promise<{ status: number; body: string }> {
  const body = JSON.stringify(payload);
  const timestamp = String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'x-event-id': eventId,
    'x-webhook-timestamp': timestamp
  };

  if (settings.WEBHOOK_SIGNING_SECRET) {
    headers['x-webhook-signature'] = hmacSignature(settings.WEBHOOK_SIGNING_SECRET, timestamp, body);
  }

  const res = await fetch(url, {
    method: 'POST',
    headers,
    body
  });

  return {
    status: res.status,
    body: await res.text()
  };
}

function parseWorkflowRow(row: Record<string, unknown>): WorkflowEnvelope | null {
  try {
    const payload = JSON.parse(String(row.payload || '{}')) as WorkflowEnvelope;
    if (!payload.event_id || !payload.event_name) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function wasDispatchSuccessful(results: IntegrationDispatchResult[]): boolean {
  return results.some((x) => x.success);
}

function nextRetryIso(retryCount: number): string {
  const seconds = Math.min(30 * 2 ** Math.max(0, retryCount), 30 * 60);
  return new Date(Date.now() + seconds * 1000).toISOString();
}

async function dispatchEnvelope(
  envelope: WorkflowEnvelope,
  settings: SettingsMap
): Promise<IntegrationDispatchResult[]> {
  const results: IntegrationDispatchResult[] = [];

  const n8nEndpoint = resolveN8nEndpoint(envelope.event_name, settings);
  if (n8nEndpoint) {
    try {
      const out = await postJsonSigned(n8nEndpoint, envelope, settings, envelope.event_id);
      results.push({ target: 'n8n', success: out.status >= 200 && out.status < 300, status: out.status });
    } catch (error) {
      results.push({ target: 'n8n', success: false, error: String(error) });
    }
  }

  if (settings.MAKE_WEBHOOK_URL) {
    try {
      const out = await postJsonSigned(settings.MAKE_WEBHOOK_URL, envelope, settings, envelope.event_id);
      results.push({ target: 'make', success: out.status >= 200 && out.status < 300, status: out.status });
    } catch (error) {
      results.push({ target: 'make', success: false, error: String(error) });
    }
  }

  if (!results.length) {
    results.push({
      target: 'n8n',
      success: false,
      error: 'no_workflow_target_configured'
    });
  }

  return results;
}

export async function dispatchAutomationEvent(
  eventName: string,
  payload: Record<string, unknown>,
  settings: SettingsMap
): Promise<IntegrationDispatchResult[]> {
  const eventId = String(payload.event_id || buildId('WF'));
  const envelope: WorkflowEnvelope = {
    event_id: eventId,
    event_name: eventName,
    occurred_at: new Date().toISOString(),
    payload
  };

  queueWorkflowEvent(eventId, eventName, JSON.stringify(envelope));
  const row = getWorkflowEvent(eventId);
  const results = await dispatchEnvelope(envelope, settings);

  if (row?.id) {
    if (wasDispatchSuccessful(results)) {
      markWorkflowEventSuccess(Number(row.id));
    } else {
      const retryCount = Number(row.retry_count || 0) + 1;
      markWorkflowEventRetry(
        Number(row.id),
        retryCount,
        nextRetryIso(retryCount),
        results.map((x) => x.error || `status_${x.status || 'unknown'}`).join('; ')
      );
    }
  }

  appendEventFeed(
    'workflow.dispatch',
    eventId,
    wasDispatchSuccessful(results) ? 'info' : 'warn',
    JSON.stringify(results)
  );

  return results;
}

export async function dispatchQueuedWorkflowEvents(settings: SettingsMap, limit = 25): Promise<Record<string, unknown>> {
  const rows = listPendingWorkflowEvents(limit);
  let processed = 0;
  let sent = 0;
  let retried = 0;

  for (const row of rows) {
    const envelope = parseWorkflowRow(row);
    if (!envelope) {
      markWorkflowEventRetry(
        Number(row.id),
        Number(row.retry_count || 0) + 1,
        nextRetryIso(Number(row.retry_count || 0) + 1),
        'invalid_workflow_payload'
      );
      processed++;
      retried++;
      continue;
    }

    const results = await dispatchEnvelope(envelope, settings);
    processed++;

    if (wasDispatchSuccessful(results)) {
      markWorkflowEventSuccess(Number(row.id));
      sent++;
    } else {
      const retryCount = Number(row.retry_count || 0) + 1;
      markWorkflowEventRetry(
        Number(row.id),
        retryCount,
        nextRetryIso(retryCount),
        results.map((x) => x.error || `status_${x.status || 'unknown'}`).join('; ')
      );
      retried++;
    }

    appendEventFeed(
      'workflow.dispatch.retry',
      envelope.event_id,
      wasDispatchSuccessful(results) ? 'info' : 'warn',
      JSON.stringify(results)
    );
  }

  return {
    job: 'workflow-dispatch',
    processed,
    sent,
    retried
  };
}

function verifyCallbackSignature(
  payload: WorkflowCallbackPayload,
  signatureHeader: string,
  timestampHeader: string,
  settings: SettingsMap
): boolean {
  if (!settings.WEBHOOK_SIGNING_SECRET) {
    return true;
  }
  if (!signatureHeader || !timestampHeader) {
    return false;
  }

  const expected = hmacSignature(settings.WEBHOOK_SIGNING_SECRET, timestampHeader, JSON.stringify(payload));
  return expected === signatureHeader;
}

export function handleWorkflowCallback(
  payload: WorkflowCallbackPayload,
  signatureHeader: string,
  timestampHeader: string,
  settings: SettingsMap
): Record<string, unknown> {
  if (!payload.event_id || !payload.status) {
    return {
      ok: false,
      status_code: 400,
      error: 'Missing required fields: event_id, status'
    };
  }

  if (!verifyCallbackSignature(payload, signatureHeader, timestampHeader, settings)) {
    return {
      ok: false,
      status_code: 401,
      error: 'Invalid workflow callback signature'
    };
  }

  const event = getWorkflowEvent(payload.event_id);
  if (!event) {
    return {
      ok: false,
      status_code: 404,
      error: 'Unknown event_id'
    };
  }

  const normalizedStatus = String(payload.status).toLowerCase();
  if (['completed', 'success', 'ok'].includes(normalizedStatus)) {
    markWorkflowEventCallback(payload.event_id, 'completed', String(payload.details || ''));
    appendEventFeed('workflow.callback.success', payload.event_id, 'info', String(payload.details || ''));
    return { ok: true, status_code: 200, duplicate: false };
  }

  markWorkflowEventCallback(payload.event_id, 'failed', String(payload.details || 'callback_failed'));
  appendEventFeed('workflow.callback.failed', payload.event_id, 'warn', String(payload.details || 'callback_failed'));
  return { ok: true, status_code: 200, duplicate: false };
}
