import { db, getSettings, logJobRun } from '../db.js';
import {
  OUTREACH_STEPS,
  REQUIRED_REPLY_WEBHOOK_FIELDS,
  REQUIRED_STRIPE_WEBHOOK_FIELDS,
  STATUS,
  TERMINAL_SUPPRESSED
} from '../constants.js';
import { sendEmail } from './emailService.js';
import { generateTextWithFallback } from './modelRouter.js';
import { dispatchAutomationEvent } from './integrationService.js';
import type {
  JobRunResult,
  Lead,
  ReplyWebhookPayload,
  SettingsMap,
  StripeWebhookPayload
} from '../types.js';
import {
  buildId,
  hoursFromNow,
  isValidEmail,
  isWithinQuietHours,
  normalize,
  parseNumber,
  truncate
} from '../utils.js';

function nowIso(): string {
  return new Date().toISOString();
}

function startOfUtcDayIso(date: Date): string {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())).toISOString();
}

function startOfUtcHourIso(date: Date): string {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), date.getUTCHours())
  ).toISOString();
}

function resolveLeadTimeZone(lead: Lead, settings: SettingsMap): string {
  const owner = String(lead.owner ?? '').trim();
  if (/^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/.test(owner)) {
    return owner;
  }
  return settings.DEFAULT_OWNER_TZ || 'America/New_York';
}

function classifyReply(text: string): 'positive' | 'neutral' | 'negative' | 'optout' {
  const body = normalize(text);
  if (!body) {
    return 'neutral';
  }

  const optOutPatterns = ['unsubscribe', 'stop', 'remove me', 'do not contact', "don't contact", 'opt out'];
  const negativePatterns = ['not interested', 'no thanks', 'no thank you', 'already have', 'already solved'];
  const positivePatterns = ['interested', 'yes', 'book', 'schedule', 'call me', 'pricing', 'how much'];

  if (optOutPatterns.some((x) => body.includes(x))) {
    return 'optout';
  }
  if (negativePatterns.some((x) => body.includes(x))) {
    return 'negative';
  }
  if (positivePatterns.some((x) => body.includes(x))) {
    return 'positive';
  }
  return 'neutral';
}

function buildTemplateMessage(step: string, lead: Lead, settings: SettingsMap): { subject: string; body: string } {
  const business = lead.business_name || 'your clinic';
  const painSignal = lead.pain_signal || 'missed inbound leads';

  if (step === OUTREACH_STEPS.STEP_1) {
    return {
      subject: `Quick idea to recover missed leads for ${business}`,
      body: [
        `Hi ${business} team,`,
        '',
        `I noticed: ${painSignal}.`,
        'We run a 14-day lead reactivation sprint to recover warm leads and route hot replies to your booking flow.',
        '',
        'Open to a 15-minute fit check this week?',
        settings.CALENDLY_LINK || '[insert-calendly-link]',
        '',
        'Reply STOP to opt out.',
        '',
        `- ${settings.OFFER_NAME}`
      ].join('\n')
    };
  }

  if (step === OUTREACH_STEPS.STEP_2) {
    return {
      subject: `Follow-up: lead recovery for ${business}`,
      body: [
        `Hi ${business} team,`,
        '',
        'Quick follow-up in case this got buried.',
        'If recovering old inquiries is still a priority this month, here is a quick booking link:',
        settings.CALENDLY_LINK || '[insert-calendly-link]',
        '',
        'Reply STOP to opt out.',
        '',
        `- ${settings.OFFER_NAME}`
      ].join('\n')
    };
  }

  return {
    subject: `Last note: lead reactivation for ${business}`,
    body: [
      `Hi ${business} team,`,
      '',
      'Last note from me.',
      'If you want this set up this week, use either link below:',
      `Call: ${settings.CALENDLY_LINK || '[insert-calendly-link]'}`,
      `Deposit: ${settings.STRIPE_DEPOSIT_LINK || '[insert-deposit-link]'}`,
      '',
      'Reply STOP to opt out.',
      '',
      `- ${settings.OFFER_NAME}`
    ].join('\n')
  };
}

function tryParseAiMessage(raw: string): { subject: string; body: string } | null {
  const trimmed = raw.trim();

  try {
    const parsed = JSON.parse(trimmed) as { subject?: unknown; body?: unknown };
    if (typeof parsed.subject === 'string' && typeof parsed.body === 'string') {
      return { subject: parsed.subject.trim(), body: parsed.body.trim() };
    }
  } catch {
    // Intentionally ignore parse failure and fall back below.
  }

  const subjectLine = trimmed.split('\n').find((line) => line.toLowerCase().startsWith('subject:'));
  if (subjectLine) {
    const subject = subjectLine.split(':').slice(1).join(':').trim();
    const body = trimmed
      .split('\n')
      .filter((line) => !line.toLowerCase().startsWith('subject:'))
      .join('\n')
      .trim();

    if (subject && body) {
      return { subject, body };
    }
  }

  return null;
}

async function maybePersonalizeMessage(
  step: string,
  lead: Lead,
  settings: SettingsMap,
  fallback: { subject: string; body: string }
): Promise<{ subject: string; body: string; provider: string }> {
  const prompt = [
    'Return strict JSON with keys: subject, body.',
    'Tone: concise and professional.',
    'Do not use hype or false claims.',
    `Business: ${lead.business_name}`,
    `Niche: ${lead.niche}`,
    `City: ${lead.city}`,
    `Pain signal: ${lead.pain_signal}`,
    `Step: ${step}`,
    `Base subject: ${fallback.subject}`,
    `Base body: ${fallback.body}`,
    `Calendly: ${settings.CALENDLY_LINK}`,
    `Deposit link: ${settings.STRIPE_DEPOSIT_LINK}`
  ].join('\n');

  const response = await generateTextWithFallback(
    prompt,
    'You are an outreach copy assistant that returns short JSON only.',
    settings
  );

  const parsed = tryParseAiMessage(response.text);
  if (!parsed) {
    return { ...fallback, provider: response.providerUsed };
  }

  return {
    subject: truncate(parsed.subject || fallback.subject, 200),
    body: parsed.body || fallback.body,
    provider: response.providerUsed
  };
}

function insertOutreachLog(input: {
  leadId: string;
  step: string;
  channel: string;
  subject: string;
  message: string;
  sentAt: string;
  replyClass?: string;
  deliveryStatus?: string;
  errorCode?: string;
  messageId?: string;
}): void {
  db.prepare(
    `INSERT INTO outreach_log
      (lead_id, step, channel, subject, message, sent_at, reply_class, delivery_status, error_code, message_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    input.leadId,
    input.step,
    input.channel,
    input.subject,
    input.message,
    input.sentAt,
    input.replyClass ?? '',
    input.deliveryStatus ?? '',
    input.errorCode ?? '',
    input.messageId ?? ''
  );
}

export function addLead(payload: Partial<Lead>): Lead {
  const leadId = payload.lead_id || buildId('PR');
  const now = nowIso();

  db.prepare(
    `INSERT INTO leads
      (lead_id, business_name, niche, city, website, email, linkedin_url, pain_signal, status, next_touch_at, owner, optout_at, do_not_contact_reason, last_error, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    leadId,
    payload.business_name || 'Unknown Business',
    payload.niche || 'med spa',
    payload.city || '',
    payload.website || '',
    payload.email || '',
    payload.linkedin_url || '',
    payload.pain_signal || '',
    payload.status || STATUS.READY,
    payload.next_touch_at || now,
    payload.owner || '',
    payload.optout_at || null,
    payload.do_not_contact_reason || '',
    payload.last_error || '',
    now,
    now
  );

  return db.prepare('SELECT * FROM leads WHERE lead_id = ?').get(leadId) as Lead;
}

export function getLeads(status?: string): Lead[] {
  if (status) {
    return db
      .prepare('SELECT * FROM leads WHERE status = ? ORDER BY id DESC LIMIT 500')
      .all(status) as Lead[];
  }
  return db.prepare('SELECT * FROM leads ORDER BY id DESC LIMIT 500').all() as Lead[];
}

export function getOutreachLogs(limit = 200): Array<Record<string, unknown>> {
  return db.prepare('SELECT * FROM outreach_log ORDER BY id DESC LIMIT ?').all(limit) as Array<Record<string, unknown>>;
}

export function getMetrics(): Record<string, unknown> {
  const now = new Date();
  const startDay = startOfUtcDayIso(now);

  const totalLeads = (db.prepare('SELECT COUNT(*) AS c FROM leads').get() as { c: number }).c;
  const suppressed = (db
    .prepare(
      'SELECT COUNT(*) AS c FROM leads WHERE status IN (?, ?)'
    )
    .get(STATUS.SUPPRESSED_OPTOUT, STATUS.SUPPRESSED_BOUNCE) as { c: number }).c;

  const sendsToday = (db
    .prepare('SELECT COUNT(*) AS c FROM outreach_log WHERE sent_at >= ? AND step IN (?, ?, ?)')
    .get(startDay, OUTREACH_STEPS.STEP_1, OUTREACH_STEPS.STEP_2, OUTREACH_STEPS.STEP_3) as { c: number }).c;

  const positiveReplies = (db
    .prepare('SELECT COUNT(*) AS c FROM leads WHERE status = ?')
    .get(STATUS.POSITIVE_REPLY) as { c: number }).c;

  const cashCollected = (db
    .prepare("SELECT COALESCE(SUM(amount), 0) AS total FROM payments WHERE status = 'paid'")
    .get() as { total: number }).total;

  return {
    totalLeads,
    suppressed,
    sendsToday,
    positiveReplies,
    cashCollected
  };
}

export function runDailyProspectingBatch(): JobRunResult {
  const settings = getSettings();
  const maxPromote = parseNumber(settings.PROSPECTING_PROMOTE_LIMIT, 500);

  const intakeRows = db
    .prepare('SELECT * FROM lead_intake WHERE processed_at IS NULL ORDER BY id ASC LIMIT ?')
    .all(maxPromote) as Array<Record<string, unknown>>;

  let promoted = 0;
  const now = nowIso();

  const promoteTx = db.transaction((rows: Array<Record<string, unknown>>) => {
    for (const row of rows) {
      const businessName = String(row.business_name || '').trim();
      const email = String(row.email || '').trim();
      if (!businessName || !email) {
        continue;
      }

      const existing = db
        .prepare('SELECT 1 FROM leads WHERE lower(email) = lower(?) AND lower(business_name) = lower(?) LIMIT 1')
        .get(email, businessName) as { 1: number } | undefined;

      if (!existing) {
        addLead({
          lead_id: String(row.lead_id || buildId('PR')),
          business_name: businessName,
          niche: String(row.niche || 'med spa'),
          city: String(row.city || ''),
          website: String(row.website || ''),
          email,
          linkedin_url: String(row.linkedin_url || ''),
          pain_signal: String(row.pain_signal || ''),
          status: STATUS.READY,
          next_touch_at: now,
          owner: String(row.owner || '')
        });
        promoted++;
      }

      db.prepare('UPDATE lead_intake SET processed_at = ? WHERE id = ?').run(now, row.id);
    }
  });

  promoteTx(intakeRows);
  const details = `promoted=${promoted}`;
  logJobRun('runDailyProspectingBatch', 'success', details);

  return {
    job: 'runDailyProspectingBatch',
    processed: intakeRows.length,
    sent: 0,
    details
  };
}

async function runOutreachStep(mode: 'new' | 'followup'): Promise<JobRunResult> {
  const settings = getSettings();
  const now = new Date();
  const nowIsoValue = now.toISOString();

  const runCap = mode === 'new' ? parseNumber(settings.RUN_NEW_OUTREACH_CAP, 40) : parseNumber(settings.RUN_FOLLOWUP_CAP, 60);
  const dailyNewCap = parseNumber(settings.DAILY_NEW_OUTREACH_CAP, 250);
  const warmupDailyLimit = parseNumber(settings.WARMUP_DAILY_LIMIT, 80);
  const hourlyCap = parseNumber(settings.MAX_SENDS_PER_HOUR, 20);
  const quietStart = parseNumber(settings.QUIET_HOURS_START, 20);
  const quietEnd = parseNumber(settings.QUIET_HOURS_END, 8);

  const dayStart = startOfUtcDayIso(now);
  const hourStart = startOfUtcHourIso(now);

  const sentTodayAll = (db
    .prepare('SELECT COUNT(*) AS c FROM outreach_log WHERE sent_at >= ? AND step IN (?, ?, ?)')
    .get(dayStart, OUTREACH_STEPS.STEP_1, OUTREACH_STEPS.STEP_2, OUTREACH_STEPS.STEP_3) as { c: number }).c;

  const sentTodayNew = (db
    .prepare('SELECT COUNT(*) AS c FROM outreach_log WHERE sent_at >= ? AND step = ?')
    .get(dayStart, OUTREACH_STEPS.STEP_1) as { c: number }).c;

  const sentThisHour = (db
    .prepare('SELECT COUNT(*) AS c FROM outreach_log WHERE sent_at >= ? AND step IN (?, ?, ?)')
    .get(hourStart, OUTREACH_STEPS.STEP_1, OUTREACH_STEPS.STEP_2, OUTREACH_STEPS.STEP_3) as { c: number }).c;

  let statusFilter: string = STATUS.READY;
  let step: string = OUTREACH_STEPS.STEP_1;

  if (mode === 'followup') {
    // Process first and second followups together in deterministic order.
    statusFilter = STATUS.FOLLOWUP_1_DUE;
    step = OUTREACH_STEPS.STEP_2;
  }

  const candidates = db
    .prepare(
      `SELECT * FROM leads
       WHERE status IN (?, ?, ?)
         AND (next_touch_at IS NULL OR next_touch_at <= ?)
       ORDER BY id ASC
       LIMIT 500`
    )
    .all(
      mode === 'new' ? STATUS.READY : STATUS.FOLLOWUP_1_DUE,
      mode === 'new' ? STATUS.READY : STATUS.FOLLOWUP_2_DUE,
      mode === 'new' ? STATUS.READY : STATUS.FOLLOWUP_2_DUE,
      nowIsoValue
    ) as Lead[];

  let sent = 0;
  let processed = 0;
  let skipped = 0;

  for (const lead of candidates) {
    if (TERMINAL_SUPPRESSED.has(lead.status) || lead.status === STATUS.CLOSED_LOST || lead.status === STATUS.CLOSED_WON) {
      skipped++;
      continue;
    }

    const leadStep =
      mode === 'new'
        ? OUTREACH_STEPS.STEP_1
        : lead.status === STATUS.FOLLOWUP_1_DUE
          ? OUTREACH_STEPS.STEP_2
          : OUTREACH_STEPS.STEP_3;

    if (sent >= runCap) {
      break;
    }

    if (sentThisHour + sent >= hourlyCap) {
      break;
    }

    if (sentTodayAll + sent >= warmupDailyLimit) {
      break;
    }

    if (mode === 'new' && sentTodayNew + sent >= dailyNewCap) {
      break;
    }

    const tz = resolveLeadTimeZone(lead, settings);
    if (isWithinQuietHours(now, tz, quietStart, quietEnd)) {
      skipped++;
      continue;
    }

    if (!isValidEmail(lead.email)) {
      db.prepare(
        `UPDATE leads
         SET status=?, next_touch_at=NULL, last_error=?, updated_at=?
         WHERE lead_id=?`
      ).run(STATUS.SUPPRESSED_BOUNCE, 'invalid_email_format', nowIsoValue, lead.lead_id);

      insertOutreachLog({
        leadId: lead.lead_id,
        step: leadStep,
        channel: 'email',
        subject: '',
        message: '[SEND_ERROR] invalid_email_format',
        sentAt: nowIsoValue,
        replyClass: 'error',
        deliveryStatus: 'failed',
        errorCode: 'invalid_email_format',
        messageId: buildId('MSG')
      });

      processed++;
      continue;
    }

    const template = buildTemplateMessage(leadStep, lead, settings);
    const aiMessage = await maybePersonalizeMessage(leadStep, lead, settings, template);
    const messageId = buildId('MSG');
    const sendResult = await sendEmail(lead.email, aiMessage.subject, aiMessage.body, settings, messageId);

    if (sendResult.deliveryStatus === 'failed') {
      const nextStatus = sendResult.errorCode === 'bounce' ? STATUS.SUPPRESSED_BOUNCE : STATUS.HOLD;
      db.prepare(
        `UPDATE leads
         SET status=?, next_touch_at=NULL, last_error=?, updated_at=?
         WHERE lead_id=?`
      ).run(nextStatus, sendResult.errorCode || 'send_error', nowIsoValue, lead.lead_id);

      insertOutreachLog({
        leadId: lead.lead_id,
        step: leadStep,
        channel: 'email',
        subject: aiMessage.subject,
        message: `[SEND_ERROR] ${sendResult.errorCode || 'send_error'}`,
        sentAt: nowIsoValue,
        replyClass: 'error',
        deliveryStatus: 'failed',
        errorCode: sendResult.errorCode || 'send_error',
        messageId
      });

      processed++;
      continue;
    }

    sent++;
    processed++;

    if (leadStep === OUTREACH_STEPS.STEP_1) {
      db.prepare(
        `UPDATE leads
         SET status=?, last_touch_at=?, next_touch_at=?, last_error='', updated_at=?
         WHERE lead_id=?`
      ).run(STATUS.FOLLOWUP_1_DUE, nowIsoValue, hoursFromNow(24), nowIsoValue, lead.lead_id);
    } else if (leadStep === OUTREACH_STEPS.STEP_2) {
      db.prepare(
        `UPDATE leads
         SET status=?, last_touch_at=?, next_touch_at=?, last_error='', updated_at=?
         WHERE lead_id=?`
      ).run(STATUS.FOLLOWUP_2_DUE, nowIsoValue, hoursFromNow(48), nowIsoValue, lead.lead_id);
    } else {
      db.prepare(
        `UPDATE leads
         SET status=?, last_touch_at=?, next_touch_at=NULL, last_error='', updated_at=?
         WHERE lead_id=?`
      ).run(STATUS.COMPLETED_OUTREACH, nowIsoValue, nowIsoValue, lead.lead_id);
    }

    insertOutreachLog({
      leadId: lead.lead_id,
      step: leadStep,
      channel: 'email',
      subject: aiMessage.subject,
      message: aiMessage.body,
      sentAt: nowIsoValue,
      replyClass: '',
      deliveryStatus: sendResult.deliveryStatus,
      errorCode: '',
      messageId
    });
  }

  const result: JobRunResult = {
    job: mode === 'new' ? 'runOutreachBatch' : 'runFollowUpBatch',
    processed,
    sent,
    skipped,
    details: `statusFilter=${statusFilter}; step=${step}`
  };

  logJobRun(result.job, 'success', JSON.stringify(result));
  return result;
}

export async function runOutreachBatch(): Promise<JobRunResult> {
  return runOutreachStep('new');
}

export async function runFollowUpBatch(): Promise<JobRunResult> {
  return runOutreachStep('followup');
}

function requireFields(payload: Record<string, unknown>, fields: readonly string[]): string[] {
  const missing: string[] = [];
  for (const field of fields) {
    if (!Object.prototype.hasOwnProperty.call(payload, field) || payload[field] === '' || payload[field] === null) {
      missing.push(field);
    }
  }
  return missing;
}

function upsertDeal(leadId: string, stage: string, quotedPrice: number): string {
  const existing = db.prepare('SELECT deal_id FROM deals WHERE lead_id = ? LIMIT 1').get(leadId) as
    | { deal_id: string }
    | undefined;

  if (existing?.deal_id) {
    db.prepare('UPDATE deals SET stage=?, quoted_price=?, updated_at=? WHERE deal_id=?').run(
      stage,
      quotedPrice,
      nowIso(),
      existing.deal_id
    );
    return existing.deal_id;
  }

  const dealId = buildId('DL');
  db.prepare(
    `INSERT INTO deals (deal_id, lead_id, stage, quoted_price, close_by, objection_code, created_at, updated_at)
     VALUES (?, ?, ?, ?, '', '', ?, ?)`
  ).run(dealId, leadId, stage, quotedPrice, nowIso(), nowIso());

  return dealId;
}

export async function handleReplyWebhook(payload: ReplyWebhookPayload): Promise<Record<string, unknown>> {
  const missing = requireFields(payload, REQUIRED_REPLY_WEBHOOK_FIELDS);
  if (missing.length) {
    return {
      ok: false,
      status_code: 400,
      error: `Missing required fields: ${missing.join(', ')}`
    };
  }

  if (Number.isNaN(new Date(payload.received_at).getTime())) {
    return {
      ok: false,
      status_code: 400,
      error: 'Invalid received_at. Expected ISO timestamp.'
    };
  }

  const existing = db.prepare('SELECT id FROM replies_inbox WHERE reply_id = ?').get(payload.reply_id) as
    | { id: number }
    | undefined;

  if (existing) {
    return {
      ok: true,
      status_code: 200,
      duplicate: true,
      reply_id: payload.reply_id
    };
  }

  db.prepare(
    `INSERT INTO replies_inbox (reply_id, prospect_id, email, body, received_at, processed_at, reply_class, message_id)
     VALUES (?, ?, ?, ?, ?, NULL, '', ?)`
  ).run(payload.reply_id, payload.prospect_id || '', payload.email, payload.body, payload.received_at, payload.message_id);

  await runReplyTriage();

  return {
    ok: true,
    status_code: 200,
    duplicate: false,
    reply_id: payload.reply_id
  };
}

export async function handleStripeWebhook(payload: StripeWebhookPayload): Promise<Record<string, unknown>> {
  const settings = getSettings();

  const missing = requireFields(payload as Record<string, unknown>, REQUIRED_STRIPE_WEBHOOK_FIELDS);
  if (missing.length) {
    return {
      ok: false,
      status_code: 400,
      error: `Missing required fields: ${missing.join(', ')}`
    };
  }

  if (settings.STRIPE_WEBHOOK_TOKEN && payload.webhook_token !== settings.STRIPE_WEBHOOK_TOKEN) {
    return {
      ok: false,
      status_code: 401,
      error: 'Invalid webhook token'
    };
  }

  const amount = parseNumber(payload.amount, Number.NaN);
  if (!Number.isFinite(amount)) {
    return {
      ok: false,
      status_code: 400,
      error: 'Invalid amount. Expected numeric value.'
    };
  }

  const existing = db.prepare('SELECT id FROM payments WHERE stripe_event_id = ?').get(payload.event_id) as
    | { id: number }
    | undefined;

  if (existing) {
    return {
      ok: true,
      status_code: 200,
      duplicate: true,
      stripe_event_id: payload.event_id
    };
  }

  const leadId = payload.prospect_id || payload.client_id || '';
  const dealId = payload.deal_id || upsertDeal(leadId || buildId('PR'), 'deposit_paid', amount);

  db.prepare(
    `INSERT INTO payments (payment_id, deal_id, amount, status, paid_at, stripe_event_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    payload.payment_id,
    dealId,
    amount,
    payload.status,
    payload.paid_at || nowIso(),
    payload.event_id
  );

  db.prepare('UPDATE deals SET stage=?, updated_at=? WHERE deal_id=?').run('deposit_paid', nowIso(), dealId);

  const clientId = payload.client_id || payload.prospect_id || dealId;
  db.prepare(
    `INSERT INTO delivery (client_id, assets_received, workflow_deployed, qa_status, handoff_status, created_at, updated_at)
     VALUES (?, 'pending', 'pending', 'pending', 'pending', ?, ?)
     ON CONFLICT(client_id) DO NOTHING`
  ).run(clientId, nowIso(), nowIso());

  await dispatchAutomationEvent(
    'payment_received',
    {
      payment_id: payload.payment_id,
      deal_id: dealId,
      client_id: clientId,
      amount,
      status: payload.status
    },
    settings
  );

  return {
    ok: true,
    status_code: 200,
    duplicate: false,
    payment_id: payload.payment_id
  };
}

export async function runReplyTriage(): Promise<JobRunResult> {
  const settings = getSettings();
  const pendingReplies = db
    .prepare('SELECT * FROM replies_inbox WHERE processed_at IS NULL ORDER BY id ASC LIMIT 500')
    .all() as Array<Record<string, unknown>>;

  let processed = 0;

  for (const reply of pendingReplies) {
    const replyText = String(reply.body || '');
    const classification = classifyReply(replyText);
    const now = nowIso();

    db.prepare('UPDATE replies_inbox SET processed_at=?, reply_class=? WHERE id=?').run(now, classification, reply.id);

    const lead = db
      .prepare('SELECT * FROM leads WHERE lead_id = ? OR lower(email)=lower(?) ORDER BY id ASC LIMIT 1')
      .get(String(reply.prospect_id || ''), String(reply.email || '')) as Lead | undefined;

    if (!lead) {
      processed++;
      continue;
    }

    if (classification === 'positive') {
      db.prepare(
        `UPDATE leads
         SET status=?, next_touch_at=NULL, last_touch_at=?, last_error='', updated_at=?
         WHERE lead_id=?`
      ).run(STATUS.POSITIVE_REPLY, now, now, lead.lead_id);

      const dealId = upsertDeal(lead.lead_id, 'interested', parseNumber(settings.DEFAULT_QUOTED_PRICE, 1500));

      await dispatchAutomationEvent(
        'positive_reply',
        {
          lead_id: lead.lead_id,
          email: lead.email,
          business_name: lead.business_name,
          deal_id: dealId
        },
        settings
      );

      const inviteSubject = `Scheduling link for ${lead.business_name}`;
      const inviteBody = [
        'Thanks for the reply.',
        '',
        'Book here:',
        settings.CALENDLY_LINK || '[insert-calendly-link]',
        '',
        'Deposit link:',
        settings.STRIPE_DEPOSIT_LINK || '[insert-deposit-link]'
      ].join('\n');

      const messageId = buildId('MSG');
      const sendResult = await sendEmail(lead.email, inviteSubject, inviteBody, settings, messageId);

      insertOutreachLog({
        leadId: lead.lead_id,
        step: OUTREACH_STEPS.REPLY_AUTOMATION,
        channel: 'email',
        subject: inviteSubject,
        message: truncate(replyText, 4000),
        sentAt: now,
        replyClass: classification,
        deliveryStatus: sendResult.deliveryStatus,
        errorCode: sendResult.errorCode || '',
        messageId
      });
    } else if (classification === 'neutral') {
      db.prepare(
        `UPDATE leads
         SET status=?, next_touch_at=?, last_touch_at=?, last_error='', updated_at=?
         WHERE lead_id=?`
      ).run(STATUS.NEUTRAL_REPLY, hoursFromNow(24), now, now, lead.lead_id);

      insertOutreachLog({
        leadId: lead.lead_id,
        step: OUTREACH_STEPS.REPLY_AUTOMATION,
        channel: 'email',
        subject: 'Inbound reply triaged',
        message: truncate(replyText, 4000),
        sentAt: now,
        replyClass: classification,
        deliveryStatus: 'received',
        messageId: String(reply.message_id || '')
      });
    } else if (classification === 'negative') {
      db.prepare(
        `UPDATE leads
         SET status=?, next_touch_at=NULL, last_touch_at=?, last_error='', updated_at=?
         WHERE lead_id=?`
      ).run(STATUS.NEGATIVE_REPLY, now, now, lead.lead_id);

      insertOutreachLog({
        leadId: lead.lead_id,
        step: OUTREACH_STEPS.REPLY_AUTOMATION,
        channel: 'email',
        subject: 'Inbound reply triaged',
        message: truncate(replyText, 4000),
        sentAt: now,
        replyClass: classification,
        deliveryStatus: 'received',
        messageId: String(reply.message_id || '')
      });
    } else {
      db.prepare(
        `UPDATE leads
         SET status=?, next_touch_at=NULL, optout_at=?, do_not_contact_reason='user_optout', last_touch_at=?, last_error='', updated_at=?
         WHERE lead_id=?`
      ).run(STATUS.SUPPRESSED_OPTOUT, now, now, now, lead.lead_id);

      insertOutreachLog({
        leadId: lead.lead_id,
        step: OUTREACH_STEPS.REPLY_AUTOMATION,
        channel: 'email',
        subject: 'Inbound reply triaged',
        message: truncate(replyText, 4000),
        sentAt: now,
        replyClass: classification,
        deliveryStatus: 'received',
        messageId: String(reply.message_id || '')
      });
    }

    processed++;
  }

  const result: JobRunResult = {
    job: 'runReplyTriage',
    processed
  };
  logJobRun('runReplyTriage', 'success', JSON.stringify(result));
  return result;
}

export async function runPipelineDigest(): Promise<JobRunResult & { digest: string }> {
  const settings = getSettings();
  const metrics = getMetrics();
  const now = nowIso();

  const replySnapshot = db
    .prepare(
      `SELECT
         SUM(CASE WHEN reply_class='positive' THEN 1 ELSE 0 END) AS positive,
         SUM(CASE WHEN step IN (?, ?, ?) THEN 1 ELSE 0 END) AS sends
       FROM outreach_log`
    )
    .get(OUTREACH_STEPS.STEP_1, OUTREACH_STEPS.STEP_2, OUTREACH_STEPS.STEP_3) as {
    positive: number | null;
    sends: number | null;
  };

  const positive = Number(replySnapshot.positive || 0);
  const sends = Number(replySnapshot.sends || 0);
  const rate = sends > 0 ? ((positive / sends) * 100).toFixed(2) : '0.00';

  const digest = [
    'Survival Cash Engine Daily Digest',
    '',
    `Date: ${now}`,
    `Total leads: ${metrics.totalLeads}`,
    `Suppressed: ${metrics.suppressed}`,
    `Sends today: ${metrics.sendsToday}`,
    `Positive replies: ${metrics.positiveReplies}`,
    `Cash collected: $${Number(metrics.cashCollected || 0).toFixed(2)}`,
    `Positive reply snapshot: ${positive}/${sends} (${rate}%)`
  ].join('\n');

  if (settings.OPERATOR_EMAIL) {
    await sendEmail(settings.OPERATOR_EMAIL, '[Digest] Survival Cash Engine', digest, settings, buildId('MSG'));
  }

  const result: JobRunResult & { digest: string } = {
    job: 'runPipelineDigest',
    processed: 1,
    digest
  };

  logJobRun('runPipelineDigest', 'success', JSON.stringify({ processed: 1 }));
  return result;
}

export async function runJobByName(jobName: string): Promise<JobRunResult | Record<string, unknown>> {
  if (jobName === 'prospecting') {
    return runDailyProspectingBatch();
  }
  if (jobName === 'outreach') {
    return runOutreachBatch();
  }
  if (jobName === 'followups') {
    return runFollowUpBatch();
  }
  if (jobName === 'reply-triage') {
    return runReplyTriage();
  }
  if (jobName === 'digest') {
    return runPipelineDigest();
  }

  return {
    ok: false,
    status_code: 400,
    error: `Unknown job: ${jobName}`
  };
}

export function listJobRuns(limit = 100): Array<Record<string, unknown>> {
  return db.prepare('SELECT * FROM job_runs ORDER BY id DESC LIMIT ?').all(limit) as Array<Record<string, unknown>>;
}
