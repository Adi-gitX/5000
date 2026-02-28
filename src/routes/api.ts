import { Router } from 'express';
import { z } from 'zod';

import { db, getSettings, setManySettings } from '../db.js';
import {
  addLead,
  getLeads,
  getMetrics,
  getOutreachLogs,
  handleReplyWebhook,
  handleStripeWebhook,
  listJobRuns,
  runDailyProspectingBatch,
  runJobByName
} from '../services/automationService.js';
import { dispatchAutomationEvent } from '../services/integrationService.js';
import { handleWorkflowCallback } from '../services/integrationService.js';
import { generateTextWithFallback } from '../services/modelRouter.js';

const settingsSchema = z.record(z.string(), z.string());

const leadSchema = z.object({
  lead_id: z.string().optional(),
  business_name: z.string().min(1),
  niche: z.string().optional(),
  city: z.string().optional(),
  website: z.string().optional(),
  email: z.string().email(),
  linkedin_url: z.string().optional(),
  pain_signal: z.string().optional(),
  owner: z.string().optional(),
  timezone: z.string().optional(),
  suppression_source: z.string().optional()
});

const intakeSchema = z.object({
  business_name: z.string().min(1),
  email: z.string().email(),
  niche: z.string().optional(),
  city: z.string().optional(),
  website: z.string().optional(),
  linkedin_url: z.string().optional(),
  pain_signal: z.string().optional(),
  owner: z.string().optional(),
  timezone: z.string().optional(),
  source: z.string().optional()
});

const bulkIntakeSchema = z.object({
  rows: z.array(intakeSchema).min(1)
});

const agentGenerateSchema = z.object({
  prompt: z.string().min(1),
  systemPrompt: z.string().default('You are a helpful automation agent.')
});

const integrationDispatchSchema = z.object({
  event_name: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).default({})
});

const replyWebhookSchema = z.object({
  reply_id: z.string().min(1),
  prospect_id: z.string().optional(),
  email: z.string().email(),
  body: z.string().min(1),
  received_at: z.string().min(1),
  message_id: z.string().min(1)
}).strict();

const stripeWebhookSchema = z.object({
  webhook_token: z.string().min(1),
  event_id: z.string().min(1),
  payment_id: z.string().min(1),
  amount: z.union([z.number(), z.string()]),
  status: z.string().min(1),
  deal_id: z.string().optional(),
  prospect_id: z.string().optional(),
  client_id: z.string().optional(),
  paid_at: z.string().optional()
}).strict();

const workflowCallbackSchema = z.object({
  event_id: z.string().min(1),
  status: z.string().min(1),
  details: z.string().optional()
}).strict();

export const apiRouter = Router();

apiRouter.get('/health', (_req, res) => {
  res.json({
    ok: true,
    status_code: 200,
    service: 'survival-cash-engine',
    time: new Date().toISOString()
  });
});

apiRouter.get('/settings', (_req, res) => {
  res.json({ ok: true, status_code: 200, data: getSettings() });
});

apiRouter.put('/settings', (req, res) => {
  const parsed = settingsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, status_code: 400, error: parsed.error.flatten() });
  }

  setManySettings(parsed.data);
  return res.json({ ok: true, status_code: 200, data: getSettings() });
});

apiRouter.get('/leads', (req, res) => {
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  return res.json({ ok: true, status_code: 200, data: getLeads(status) });
});

apiRouter.post('/leads', (req, res) => {
  const parsed = leadSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, status_code: 400, error: parsed.error.flatten() });
  }

  const lead = addLead(parsed.data);
  return res.status(201).json({ ok: true, status_code: 201, data: lead });
});

apiRouter.post('/lead-intake', (req, res) => {
  const parsed = intakeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, status_code: 400, error: parsed.error.flatten() });
  }

  db.prepare(
    `INSERT INTO lead_intake (lead_id, business_name, niche, city, website, email, linkedin_url, pain_signal, owner, timezone, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    null,
    parsed.data.business_name,
    parsed.data.niche || 'med spa',
    parsed.data.city || '',
    parsed.data.website || '',
    parsed.data.email,
    parsed.data.linkedin_url || '',
    parsed.data.pain_signal || '',
    parsed.data.owner || '',
    parsed.data.timezone || '',
    parsed.data.source || 'manual'
  );

  return res.status(201).json({ ok: true, status_code: 201 });
});

apiRouter.post('/lead-intake/bulk', (req, res) => {
  const parsed = bulkIntakeSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, status_code: 400, error: parsed.error.flatten() });
  }

  const stmt = db.prepare(
    `INSERT INTO lead_intake (lead_id, business_name, niche, city, website, email, linkedin_url, pain_signal, owner, timezone, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const tx = db.transaction((rows: Array<z.infer<typeof intakeSchema>>) => {
    for (const row of rows) {
      stmt.run(
        null,
        row.business_name,
        row.niche || 'med spa',
        row.city || '',
        row.website || '',
        row.email,
        row.linkedin_url || '',
        row.pain_signal || '',
        row.owner || '',
        row.timezone || '',
        row.source || 'bulk'
      );
    }
  });

  tx(parsed.data.rows);
  return res.status(201).json({ ok: true, status_code: 201, inserted: parsed.data.rows.length });
});

apiRouter.post('/lead-intake/promote', (_req, res) => {
  const result = runDailyProspectingBatch();
  return res.json({ ok: true, status_code: 200, data: result });
});

apiRouter.get('/logs/outreach', (req, res) => {
  const limit = Number(req.query.limit || 200);
  return res.json({ ok: true, status_code: 200, data: getOutreachLogs(limit) });
});

apiRouter.get('/logs/jobs', (req, res) => {
  const limit = Number(req.query.limit || 200);
  return res.json({ ok: true, status_code: 200, data: listJobRuns(limit) });
});

apiRouter.get('/metrics', (_req, res) => {
  return res.json({ ok: true, status_code: 200, data: getMetrics() });
});

apiRouter.post('/jobs/:jobName', async (req, res) => {
  const jobName = String(req.params.jobName || '');
  const result = await runJobByName(jobName);

  if ('ok' in result && result.ok === false) {
    return res.status(400).json(result);
  }

  return res.json({ ok: true, status_code: 200, data: result });
});

apiRouter.post('/webhooks/reply', async (req, res) => {
  const parsed = replyWebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, status_code: 400, error: parsed.error.flatten() });
  }

  const result = await handleReplyWebhook(parsed.data);
  return res.status(Number(result.status_code || 200)).json(result);
});

apiRouter.post('/webhooks/stripe', async (req, res) => {
  const parsed = stripeWebhookSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, status_code: 400, error: parsed.error.flatten() });
  }

  const result = await handleStripeWebhook(parsed.data);
  return res.status(Number(result.status_code || 200)).json(result);
});

apiRouter.post('/webhooks/workflow-callback', (req, res) => {
  const parsed = workflowCallbackSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, status_code: 400, error: parsed.error.flatten() });
  }

  const result = handleWorkflowCallback(
    parsed.data,
    String(req.header('x-webhook-signature') || ''),
    String(req.header('x-webhook-timestamp') || ''),
    getSettings()
  );
  return res.status(Number(result.status_code || 200)).json(result);
});

apiRouter.post('/integrations/dispatch', async (req, res) => {
  const parsed = integrationDispatchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, status_code: 400, error: parsed.error.flatten() });
  }

  const results = await dispatchAutomationEvent(parsed.data.event_name, parsed.data.payload, getSettings());
  return res.json({ ok: true, status_code: 200, data: results });
});

apiRouter.post('/agent/generate', async (req, res) => {
  const parsed = agentGenerateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ ok: false, status_code: 400, error: parsed.error.flatten() });
  }

  const out = await generateTextWithFallback(parsed.data.prompt, parsed.data.systemPrompt, getSettings());
  return res.json({ ok: true, status_code: 200, data: out });
});
