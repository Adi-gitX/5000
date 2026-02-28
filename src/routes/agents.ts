import { randomBytes } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';

import {
  createAgentSession,
  createManualTask,
  deleteAgentSession,
  getAgentSession,
  getSettings,
  listManualTasks,
  updateManualTask
} from '../db.js';
import {
  appendAgentEvent,
  getAgentsOverview,
  getConnectors,
  listAgentJobs,
  pauseAgentJob,
  runAgentJob,
  testConnector
} from '../services/agentsService.js';
import { buildId } from '../utils.js';

const loginSchema = z.object({
  token: z.string().min(1)
});

const pauseSchema = z.object({
  paused: z.boolean(),
  reason: z.string().default('')
});

const createManualTaskSchema = z.object({
  title: z.string().min(1),
  details: z.string().default(''),
  owner: z.string().default('')
});

const patchManualTaskSchema = z.object({
  status: z.enum(['pending', 'in_progress', 'completed', 'blocked']).optional(),
  details: z.string().optional(),
  owner: z.string().optional()
});

function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  if (!cookieHeader) {
    return {};
  }

  const out: Record<string, string> = {};
  const entries = cookieHeader.split(';');
  for (const entry of entries) {
    const [rawKey, ...valueParts] = entry.trim().split('=');
    if (!rawKey) {
      continue;
    }
    out[rawKey] = decodeURIComponent(valueParts.join('=') || '');
  }
  return out;
}

function serializeCookie(name: string, value: string, maxAgeSeconds: number): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${name}=${encodeURIComponent(value)}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

function clearCookie(name: string): string {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `${name}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

function unauthorized(res: Response): Response {
  return res.status(401).json({ ok: false, status_code: 401, error: 'Unauthorized' });
}

function csrfRejected(res: Response): Response {
  return res.status(403).json({ ok: false, status_code: 403, error: 'Invalid CSRF token' });
}

type AgentAuthedRequest = Request & {
  agentSession?: {
    sessionId: string;
    csrfToken: string;
    expiresAt: string;
  };
};

function requireAgentSession(req: AgentAuthedRequest, res: Response, next: NextFunction): Response | void {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = cookies.agent_session;
  if (!sessionId) {
    return unauthorized(res);
  }

  const session = getAgentSession(sessionId);
  if (!session) {
    return unauthorized(res);
  }

  const method = req.method.toUpperCase();
  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrf = String(req.headers['x-csrf-token'] || '');
    if (!csrf || csrf !== session.csrf_token) {
      return csrfRejected(res);
    }
  }

  req.agentSession = {
    sessionId: session.session_id,
    csrfToken: session.csrf_token,
    expiresAt: session.expires_at
  };
  next();
}

function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('hex');
}

function resolveAdminToken(): string {
  const settings = getSettings();
  return settings.ADMIN_BOOTSTRAP_TOKEN || process.env.AGENTS_ADMIN_TOKEN || '';
}

export const agentsRouter = Router();

agentsRouter.post('/session/login', (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, status_code: 400, error: parsed.error.flatten() });
  }

  const expected = resolveAdminToken();
  if (!expected || parsed.data.token !== expected) {
    return unauthorized(res);
  }

  const sessionId = `sess_${randomToken(18)}`;
  const csrfToken = `csrf_${randomToken(16)}`;
  const expiresAt = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
  createAgentSession(sessionId, csrfToken, expiresAt);

  res.setHeader('Set-Cookie', serializeCookie('agent_session', sessionId, 12 * 60 * 60));
  appendAgentEvent('agents.login.success', buildId('EVT'), 'Agent admin session created');

  return res.json({
    ok: true,
    status_code: 200,
    csrf_token: csrfToken,
    expires_at: expiresAt
  });
});

agentsRouter.post('/session/logout', requireAgentSession, (req: AgentAuthedRequest, res) => {
  deleteAgentSession(req.agentSession?.sessionId || '');
  res.setHeader('Set-Cookie', clearCookie('agent_session'));
  return res.json({ ok: true, status_code: 200 });
});

agentsRouter.get('/session/me', requireAgentSession, (req: AgentAuthedRequest, res) => {
  return res.json({
    ok: true,
    status_code: 200,
    data: {
      session_id: req.agentSession?.sessionId,
      expires_at: req.agentSession?.expiresAt
    }
  });
});

agentsRouter.use(requireAgentSession);

agentsRouter.get('/overview', (_req, res) => {
  return res.json({ ok: true, status_code: 200, data: getAgentsOverview() });
});

agentsRouter.get('/connectors', (_req, res) => {
  return res.json({ ok: true, status_code: 200, data: getConnectors() });
});

agentsRouter.post('/connectors/test/:name', async (req, res) => {
  try {
    const out = await testConnector(String(req.params.name || ''));
    return res.json({ ok: true, status_code: 200, data: out });
  } catch (error) {
    return res.status(400).json({ ok: false, status_code: 400, error: String(error) });
  }
});

agentsRouter.get('/jobs', (_req, res) => {
  return res.json({ ok: true, status_code: 200, data: listAgentJobs() });
});

agentsRouter.post('/jobs/:jobKey/run', async (req, res) => {
  try {
    const out = await runAgentJob(String(req.params.jobKey || ''));
    appendAgentEvent('agents.job.run', buildId('EVT'), JSON.stringify({ job: req.params.jobKey }));
    return res.json({ ok: true, status_code: 200, data: out });
  } catch (error) {
    return res.status(400).json({ ok: false, status_code: 400, error: String(error) });
  }
});

agentsRouter.post('/jobs/:jobKey/pause', (req, res) => {
  const parsed = pauseSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, status_code: 400, error: parsed.error.flatten() });
  }

  try {
    const out = pauseAgentJob(String(req.params.jobKey || ''), parsed.data.paused, parsed.data.reason);
    appendAgentEvent(
      'agents.job.pause',
      buildId('EVT'),
      JSON.stringify({ job: req.params.jobKey, paused: parsed.data.paused, reason: parsed.data.reason })
    );
    return res.json({ ok: true, status_code: 200, data: out });
  } catch (error) {
    return res.status(400).json({ ok: false, status_code: 400, error: String(error) });
  }
});

agentsRouter.post('/manual-tasks', (req, res) => {
  const parsed = createManualTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, status_code: 400, error: parsed.error.flatten() });
  }

  const out = createManualTask(parsed.data.title, parsed.data.details, parsed.data.owner);
  appendAgentEvent('agents.manual_task.create', buildId('EVT'), JSON.stringify({ id: out.id || '' }));
  return res.status(201).json({ ok: true, status_code: 201, data: out });
});

agentsRouter.patch('/manual-tasks/:id', (req, res) => {
  const parsed = patchManualTaskSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, status_code: 400, error: parsed.error.flatten() });
  }

  const id = Number(req.params.id);
  if (!Number.isFinite(id)) {
    return res.status(400).json({ ok: false, status_code: 400, error: 'Invalid manual task id' });
  }

  const out = updateManualTask(id, parsed.data);
  if (!out) {
    return res.status(404).json({ ok: false, status_code: 404, error: 'Manual task not found' });
  }

  appendAgentEvent('agents.manual_task.update', buildId('EVT'), JSON.stringify({ id, patch: parsed.data }));
  return res.json({ ok: true, status_code: 200, data: out });
});

agentsRouter.get('/manual-tasks', (_req, res) => {
  return res.json({ ok: true, status_code: 200, data: listManualTasks(200) });
});
