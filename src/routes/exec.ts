import { Router } from 'express';
import { z } from 'zod';

import { handleReplyWebhook, handleStripeWebhook } from '../services/automationService.js';

const replyHookSchema = z
  .object({
    reply_id: z.string().min(1),
    email: z.string().email(),
    body: z.string().min(1),
    received_at: z.string().min(1),
    message_id: z.string().min(1),
    prospect_id: z.string().optional()
  })
  .strict();

const stripeHookSchema = z
  .object({
    webhook_token: z.string().min(1),
    event_id: z.string().min(1),
    payment_id: z.string().min(1),
    amount: z.union([z.number(), z.string()]),
    status: z.string().min(1),
    deal_id: z.string().optional(),
    prospect_id: z.string().optional(),
    client_id: z.string().optional(),
    paid_at: z.string().optional()
  })
  .strict();

function normalizeWebhookResponse(input: Record<string, unknown>): Record<string, unknown> {
  const statusCode = Number(input.status_code ?? 200);
  const out: Record<string, unknown> = {
    ok: Boolean(input.ok),
    status_code: statusCode
  };

  if (typeof input.duplicate === 'boolean') {
    out.duplicate = input.duplicate;
  }
  if (input.error) {
    out.error = String(input.error);
  }

  for (const [key, value] of Object.entries(input)) {
    if (!(key in out) && key !== 'status_code') {
      out[key] = value;
    }
  }

  return out;
}

export const execRouter = Router();

execRouter.post('/', async (req, res) => {
  const route = String(req.query.route || '').trim();
  if (!route) {
    return res.status(400).json({ ok: false, status_code: 400, error: 'Missing route query parameter' });
  }

  if (route === 'reply-hook') {
    const parsed = replyHookSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        status_code: 400,
        error: `Invalid reply-hook payload: ${parsed.error.issues.map((x) => x.path.join('.') || 'root').join(', ')}`
      });
    }

    const result = await handleReplyWebhook(parsed.data);
    const normalized = normalizeWebhookResponse(result);
    return res.status(Number(normalized.status_code || 200)).json(normalized);
  }

  if (route === 'stripe-webhook') {
    const parsed = stripeHookSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        ok: false,
        status_code: 400,
        error: `Invalid stripe-webhook payload: ${parsed.error.issues.map((x) => x.path.join('.') || 'root').join(', ')}`
      });
    }

    const result = await handleStripeWebhook(parsed.data);
    const normalized = normalizeWebhookResponse(result);
    return res.status(Number(normalized.status_code || 200)).json(normalized);
  }

  return res.status(404).json({ ok: false, status_code: 404, error: `Unknown route: ${route}` });
});
