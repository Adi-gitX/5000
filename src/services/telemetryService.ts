import { appendEventFeed } from '../db.js';
import type { SettingsMap } from '../types.js';
import { buildId } from '../utils.js';

type SentryModule = {
  init: (args: { dsn: string; tracesSampleRate?: number }) => void;
  captureException: (error: unknown, context?: unknown) => void;
};

let sentry: SentryModule | null = null;
let sentryReady = false;

export async function initializeTelemetry(settings: SettingsMap): Promise<void> {
  if (sentryReady || !settings.SENTRY_DSN) {
    return;
  }

  try {
    const mod = (await import('@sentry/node')) as unknown as SentryModule;
    mod.init({
      dsn: settings.SENTRY_DSN,
      tracesSampleRate: 0.2
    });
    sentry = mod;
    sentryReady = true;
  } catch (error) {
    appendEventFeed('telemetry.init_failed', buildId('EVT'), 'warn', String(error));
  }
}

export function captureException(error: unknown, context: Record<string, unknown> = {}): void {
  if (sentry) {
    sentry.captureException(error, { extra: context });
  }
  appendEventFeed('error.captured', buildId('EVT'), 'error', JSON.stringify({ error: String(error), context }));
}

export async function traceModelExecution(input: {
  requestId: string;
  provider: string;
  promptLength: number;
  success: boolean;
  fallbackUsed: boolean;
  settings: SettingsMap;
  errorText?: string;
}): Promise<void> {
  appendEventFeed(
    'model.execution',
    input.requestId,
    input.success ? 'info' : 'warn',
    JSON.stringify({
      provider: input.provider,
      promptLength: input.promptLength,
      success: input.success,
      fallbackUsed: input.fallbackUsed,
      errorText: input.errorText || ''
    })
  );

  const publicKey = input.settings.LANGFUSE_PUBLIC_KEY || '';
  const secretKey = input.settings.LANGFUSE_SECRET_KEY || '';
  if (!publicKey || !secretKey) {
    return;
  }

  try {
    const baseUrl = input.settings.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com';
    const endpoint = `${baseUrl.replace(/\/$/, '')}/api/public/ingestion`;
    const auth = Buffer.from(`${publicKey}:${secretKey}`).toString('base64');
    const payload = {
      batch: [
        {
          id: input.requestId,
          type: 'trace-create',
          timestamp: new Date().toISOString(),
          body: {
            id: input.requestId,
            name: 'outreach_generation',
            metadata: {
              provider: input.provider,
              promptLength: input.promptLength,
              success: input.success,
              fallbackUsed: input.fallbackUsed,
              errorText: input.errorText || ''
            }
          }
        }
      ]
    };

    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${auth}`
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    appendEventFeed('telemetry.langfuse_failed', buildId('EVT'), 'warn', String(error));
  }
}
