import type { ModelGenerationResult, ProviderAttempt, SettingsMap } from '../types.js';
import { buildId, parseNumber } from '../utils.js';
import { traceModelExecution } from './telemetryService.js';

type ProviderCircuitState = {
  failures: number;
  openUntilMs: number;
};

const providerCircuit = new Map<string, ProviderCircuitState>();

function isCircuitOpen(provider: string): boolean {
  const state = providerCircuit.get(provider);
  if (!state) {
    return false;
  }
  if (Date.now() >= state.openUntilMs) {
    providerCircuit.set(provider, { failures: state.failures, openUntilMs: 0 });
    return false;
  }
  return state.openUntilMs > Date.now();
}

function markProviderSuccess(provider: string): void {
  providerCircuit.set(provider, { failures: 0, openUntilMs: 0 });
}

function markProviderFailure(provider: string, settings: SettingsMap): void {
  const threshold = parseNumber(settings.MODEL_CB_FAILURE_THRESHOLD, 3);
  const openSeconds = parseNumber(settings.MODEL_CB_OPEN_SECONDS, 120);
  const existing = providerCircuit.get(provider) || { failures: 0, openUntilMs: 0 };
  const failures = existing.failures + 1;
  const openUntilMs = failures >= threshold ? Date.now() + openSeconds * 1000 : 0;
  providerCircuit.set(provider, { failures, openUntilMs });
}

function extractOpenAIContent(payload: unknown): string {
  const maybe = payload as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };

  const content = maybe.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') {
          return part;
        }
        if (part && typeof part === 'object' && 'text' in part) {
          return String((part as { text?: unknown }).text ?? '');
        }
        return '';
      })
      .join('\n');
  }
  return '';
}

async function callOpenAICompatible(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  systemPrompt: string;
}): Promise<string> {
  const response = await fetch(`${args.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${args.apiKey}`
    },
    body: JSON.stringify({
      model: args.model,
      temperature: 0.2,
      messages: [
        { role: 'system', content: args.systemPrompt },
        { role: 'user', content: args.prompt }
      ]
    })
  });

  if (!response.ok) {
    throw new Error(`Provider failed ${response.status}: ${await response.text()}`);
  }

  const payload = (await response.json()) as unknown;
  const text = extractOpenAIContent(payload);
  if (!text.trim()) {
    throw new Error('Provider returned empty response');
  }
  return text.trim();
}

async function callAnthropic(args: {
  apiKey: string;
  model: string;
  prompt: string;
  systemPrompt: string;
}): Promise<string> {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': args.apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: args.model,
      max_tokens: 600,
      system: args.systemPrompt,
      messages: [{ role: 'user', content: args.prompt }]
    })
  });

  if (!response.ok) {
    throw new Error(`Anthropic failed ${response.status}: ${await response.text()}`);
  }

  const payload = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = payload.content?.find((x) => x.type === 'text')?.text ?? '';
  if (!text.trim()) {
    throw new Error('Anthropic returned empty response');
  }

  return text.trim();
}

function parseProviderChain(settings: SettingsMap): string[] {
  const raw = settings.MODEL_PROVIDER_CHAIN?.trim() || 'openclaw,openai,anthropic';
  return raw
    .split(',')
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);
}

function fallbackTemplate(prompt: string): string {
  return `Fallback response (AI unavailable).\n\n${prompt}`;
}

export async function generateTextWithFallback(
  prompt: string,
  systemPrompt: string,
  settings: SettingsMap
): Promise<ModelGenerationResult> {
  const chain = parseProviderChain(settings);
  const attempts: ProviderAttempt[] = [];
  const requestId = buildId('AI');

  for (const provider of chain) {
    if (isCircuitOpen(provider)) {
      attempts.push({ provider, success: false, error: 'circuit_open' });
      continue;
    }

    try {
      if (provider === 'openclaw') {
        const apiKey = settings.OPENCLAW_API_KEY || '';
        const baseUrl = settings.OPENCLAW_BASE_URL || 'https://api.openclaw.example/v1';
        const model = settings.OPENCLAW_MODEL || 'openclaw-chat';
        if (!apiKey) {
          throw new Error('OPENCLAW_API_KEY missing');
        }
        const text = await callOpenAICompatible({
          baseUrl,
          apiKey,
          model,
          prompt,
          systemPrompt
        });

        attempts.push({ provider, success: true });
        markProviderSuccess(provider);
        await traceModelExecution({
          requestId,
          provider,
          promptLength: prompt.length,
          success: true,
          fallbackUsed: false,
          settings
        });
        return { text, providerUsed: provider, attempts, fallbackUsed: false };
      }

      if (provider === 'openai') {
        const apiKey = settings.OPENAI_API_KEY || '';
        const baseUrl = settings.OPENAI_BASE_URL || 'https://api.openai.com/v1';
        const model = settings.OPENAI_MODEL || 'gpt-4.1-mini';
        if (!apiKey) {
          throw new Error('OPENAI_API_KEY missing');
        }

        const text = await callOpenAICompatible({
          baseUrl,
          apiKey,
          model,
          prompt,
          systemPrompt
        });

        attempts.push({ provider, success: true });
        markProviderSuccess(provider);
        await traceModelExecution({
          requestId,
          provider,
          promptLength: prompt.length,
          success: true,
          fallbackUsed: false,
          settings
        });
        return { text, providerUsed: provider, attempts, fallbackUsed: false };
      }

      if (provider === 'anthropic') {
        const apiKey = settings.ANTHROPIC_API_KEY || '';
        const model = settings.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest';
        if (!apiKey) {
          throw new Error('ANTHROPIC_API_KEY missing');
        }
        const text = await callAnthropic({
          apiKey,
          model,
          prompt,
          systemPrompt
        });

        attempts.push({ provider, success: true });
        markProviderSuccess(provider);
        await traceModelExecution({
          requestId,
          provider,
          promptLength: prompt.length,
          success: true,
          fallbackUsed: false,
          settings
        });
        return { text, providerUsed: provider, attempts, fallbackUsed: false };
      }

      attempts.push({ provider, success: false, error: 'Unknown provider' });
    } catch (error) {
      markProviderFailure(provider, settings);
      attempts.push({ provider, success: false, error: String(error) });
    }
  }

  await traceModelExecution({
    requestId,
    provider: 'fallback-template',
    promptLength: prompt.length,
    success: false,
    fallbackUsed: true,
    settings,
    errorText: attempts.map((x) => `${x.provider}:${x.error || 'unknown'}`).join('; ')
  });

  return {
    text: fallbackTemplate(prompt),
    providerUsed: 'fallback-template',
    attempts,
    fallbackUsed: true
  };
}
