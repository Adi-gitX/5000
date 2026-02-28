import type { SettingsMap } from '../types.js';

export type IntegrationDispatchResult = {
  target: 'n8n' | 'make';
  success: boolean;
  status?: number;
  error?: string;
};

async function postJson(url: string, payload: unknown): Promise<{ status: number; body: string }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  return {
    status: res.status,
    body: await res.text()
  };
}

export async function dispatchAutomationEvent(
  eventName: string,
  payload: Record<string, unknown>,
  settings: SettingsMap
): Promise<IntegrationDispatchResult[]> {
  const results: IntegrationDispatchResult[] = [];

  if (settings.N8N_WEBHOOK_URL) {
    try {
      const out = await postJson(settings.N8N_WEBHOOK_URL, {
        event_name: eventName,
        payload
      });
      results.push({ target: 'n8n', success: out.status >= 200 && out.status < 300, status: out.status });
    } catch (error) {
      results.push({ target: 'n8n', success: false, error: String(error) });
    }
  }

  if (settings.MAKE_WEBHOOK_URL) {
    try {
      const out = await postJson(settings.MAKE_WEBHOOK_URL, {
        event_name: eventName,
        payload
      });
      results.push({ target: 'make', success: out.status >= 200 && out.status < 300, status: out.status });
    } catch (error) {
      results.push({ target: 'make', success: false, error: String(error) });
    }
  }

  return results;
}
