const SHEETS = {
  PROSPECTS: 'prospects',
  OUTREACH_LOG: 'outreach_log',
  DEALS: 'deals',
  PAYMENTS: 'payments',
  DELIVERY: 'delivery',
  SETTINGS: 'settings',
  LEAD_INTAKE: 'lead_intake',
  REPLIES_INBOX: 'replies_inbox'
};

const HEADERS = {
  prospects: [
    'id',
    'business_name',
    'niche',
    'city',
    'website',
    'email',
    'linkedin_url',
    'pain_signal',
    'status',
    'last_touch_at',
    'next_touch_at',
    'owner',
    'optout_at',
    'do_not_contact_reason',
    'last_error'
  ],
  outreach_log: [
    'prospect_id',
    'step',
    'channel',
    'subject',
    'message',
    'sent_at',
    'reply_class',
    'delivery_status',
    'error_code',
    'message_id'
  ],
  deals: ['deal_id', 'prospect_id', 'stage', 'quoted_price', 'close_by', 'objection_code'],
  payments: ['payment_id', 'deal_id', 'amount', 'status', 'paid_at', 'stripe_event_id'],
  delivery: ['client_id', 'assets_received', 'workflow_deployed', 'qa_status', 'handoff_status'],
  settings: ['key', 'value'],
  lead_intake: [
    'id',
    'business_name',
    'niche',
    'city',
    'website',
    'email',
    'linkedin_url',
    'pain_signal',
    'owner',
    'source',
    'processed_at'
  ],
  replies_inbox: ['reply_id', 'prospect_id', 'email', 'body', 'received_at', 'processed_at', 'reply_class', 'message_id']
};

const DEFAULT_SETTINGS = {
  OPERATOR_EMAIL: '',
  SENDER_NAME: 'Lead Reactivation Desk',
  OFFER_NAME: '14-Day Lead Reactivation Sprint + AI Booking Assistant',
  CALENDLY_LINK: '',
  STRIPE_DEPOSIT_LINK: '',
  STRIPE_FULL_LINK: '',
  STRIPE_WEBHOOK_TOKEN: '',
  DAILY_NEW_OUTREACH_CAP: '250',
  RUN_NEW_OUTREACH_CAP: '40',
  RUN_FOLLOWUP_CAP: '60',
  MAX_SENDS_PER_HOUR: '20',
  WARMUP_DAILY_LIMIT: '80',
  QUIET_HOURS_START: '20',
  QUIET_HOURS_END: '08',
  DEFAULT_OWNER_TZ: 'America/New_York',
  DRY_RUN: 'TRUE',
  DEFAULT_QUOTED_PRICE: '1500',
  PIVOT_REPLY_RATE_FLOOR: '0.01'
};

const STATUS = {
  READY: 'ready',
  FOLLOWUP_1_DUE: 'followup_1_due',
  FOLLOWUP_2_DUE: 'followup_2_due',
  COMPLETED_OUTREACH: 'completed_outreach',
  POSITIVE_REPLY: 'positive_reply',
  NEUTRAL_REPLY: 'neutral_reply',
  NEGATIVE_REPLY: 'negative_reply',
  OPTOUT: 'optout',
  SUPPRESSED_OPTOUT: 'suppressed_optout',
  SUPPRESSED_BOUNCE: 'suppressed_bounce',
  HOLD: 'hold',
  CLOSED_WON: 'closed_won',
  CLOSED_LOST: 'closed_lost'
};

const OUTREACH_STEPS = {
  STEP_1: 'step_1',
  STEP_2: 'step_2',
  STEP_3: 'step_3',
  REPLY_AUTOMATION: 'reply_automation'
};

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Survival Engine')
    .addItem('Setup System', 'setupSystem')
    .addItem('Create/Reset Triggers', 'createOrResetTriggers')
    .addSeparator()
    .addItem('Run Daily Prospecting Batch', 'runDailyProspectingBatch')
    .addItem('Run Outreach Batch', 'runOutreachBatch')
    .addItem('Run Follow-up Batch', 'runFollowUpBatch')
    .addItem('Run Reply Triage', 'runReplyTriage')
    .addItem('Run Pipeline Digest', 'runPipelineDigest')
    .addSeparator()
    .addItem('Seed Demo Data', 'seedDemoData')
    .addItem('Run Smoke Checks', 'runSmokeChecks')
    .addToUi();
}

function setupSystem() {
  ensureSheet_(SHEETS.PROSPECTS, HEADERS.prospects);
  ensureSheet_(SHEETS.OUTREACH_LOG, HEADERS.outreach_log);
  ensureSheet_(SHEETS.DEALS, HEADERS.deals);
  ensureSheet_(SHEETS.PAYMENTS, HEADERS.payments);
  ensureSheet_(SHEETS.DELIVERY, HEADERS.delivery);
  ensureSheet_(SHEETS.SETTINGS, HEADERS.settings);
  ensureSheet_(SHEETS.LEAD_INTAKE, HEADERS.lead_intake);
  ensureSheet_(SHEETS.REPLIES_INBOX, HEADERS.replies_inbox);

  backfillSheetRows_(SHEETS.PROSPECTS, HEADERS.prospects);
  backfillSheetRows_(SHEETS.OUTREACH_LOG, HEADERS.outreach_log);
  backfillSheetRows_(SHEETS.DEALS, HEADERS.deals);
  backfillSheetRows_(SHEETS.PAYMENTS, HEADERS.payments);
  backfillSheetRows_(SHEETS.DELIVERY, HEADERS.delivery);
  backfillSheetRows_(SHEETS.SETTINGS, HEADERS.settings);
  backfillSheetRows_(SHEETS.LEAD_INTAKE, HEADERS.lead_intake);
  backfillSheetRows_(SHEETS.REPLIES_INBOX, HEADERS.replies_inbox);

  seedDefaultSettings_();
}

function createOrResetTriggers() {
  const targetFunctions = [
    'runDailyProspectingBatch',
    'runOutreachBatch',
    'runFollowUpBatch',
    'runReplyTriage',
    'runPipelineDigest'
  ];

  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (targetFunctions.indexOf(trigger.getHandlerFunction()) >= 0) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger('runDailyProspectingBatch').timeBased().everyHours(6).create();
  ScriptApp.newTrigger('runOutreachBatch').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('runFollowUpBatch').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('runReplyTriage').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('runPipelineDigest').timeBased().everyDays(1).atHour(21).create();
}

function runDailyProspectingBatch() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settings = getSettings_();
  const prospectsSheet = ss.getSheetByName(SHEETS.PROSPECTS);
  const intakeSheet = ss.getSheetByName(SHEETS.LEAD_INTAKE);

  const prospectsData = getSheetData_(prospectsSheet);
  const intakeData = getSheetData_(intakeSheet);

  if (!intakeData.rows.length) {
    return { inserted: 0, reason: 'No intake rows found.' };
  }

  const prospectIdx = indexMap_(prospectsData.headers);
  const intakeIdx = indexMap_(intakeData.headers);

  const existing = {};
  prospectsData.rows.forEach(function (row) {
    const email = normalize_(row[prospectIdx.email]);
    const name = normalize_(row[prospectIdx.business_name]);
    if (email || name) {
      existing[email + '|' + name] = true;
    }
  });

  const now = new Date();
  const intakeUpdates = [];
  const inserts = [];

  intakeData.rows.forEach(function (row, rowIndex) {
    const processedAt = row[intakeIdx.processed_at];
    if (processedAt) {
      return;
    }

    const businessName = String(row[intakeIdx.business_name] || '').trim();
    const email = String(row[intakeIdx.email] || '').trim();
    if (!businessName || !email) {
      return;
    }

    const key = normalize_(email) + '|' + normalize_(businessName);
    if (existing[key]) {
      intakeUpdates.push({ rowNumber: rowIndex + 2, processedAt: now });
      return;
    }

    existing[key] = true;

    inserts.push([
      row[intakeIdx.id] || buildId_('PR'),
      businessName,
      row[intakeIdx.niche] || 'med spa',
      row[intakeIdx.city] || '',
      row[intakeIdx.website] || '',
      email,
      row[intakeIdx.linkedin_url] || '',
      row[intakeIdx.pain_signal] || '',
      STATUS.READY,
      '',
      now,
      row[intakeIdx.owner] || Session.getActiveUser().getEmail(),
      '',
      '',
      ''
    ]);

    intakeUpdates.push({ rowNumber: rowIndex + 2, processedAt: now });
  });

  if (inserts.length) {
    appendRows_(prospectsSheet, inserts);
  }

  intakeUpdates.forEach(function (item) {
    intakeSheet.getRange(item.rowNumber, intakeIdx.processed_at + 1).setValue(item.processedAt);
  });

  Logger.log('runDailyProspectingBatch inserted=' + inserts.length);
  Logger.log('Pivot recommendation: ' + getPivotRecommendation_());

  return { inserted: inserts.length };
}

function runOutreachBatch() {
  return runOutreachStep_('new');
}

function runFollowUpBatch() {
  return runOutreachStep_('followup');
}

function runOutreachStep_(mode) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settings = getSettings_();
  const prospectsSheet = ss.getSheetByName(SHEETS.PROSPECTS);
  const logSheet = ss.getSheetByName(SHEETS.OUTREACH_LOG);

  const prospectsData = getSheetData_(prospectsSheet);
  const pIdx = indexMap_(prospectsData.headers);

  const now = new Date();
  const logs = [];
  let sentCount = 0;

  const runCap = mode === 'new' ? toInt_(settings.RUN_NEW_OUTREACH_CAP, 40) : toInt_(settings.RUN_FOLLOWUP_CAP, 60);
  const dailyCap = toInt_(settings.DAILY_NEW_OUTREACH_CAP, 250);
  const warmupDailyLimit = toInt_(settings.WARMUP_DAILY_LIMIT, 80);
  const maxSendsPerHour = toInt_(settings.MAX_SENDS_PER_HOUR, 20);
  const sentTodayNew = getSentTodayCount_(logSheet);
  const sentTodayAll = getSentTodayAllCount_(logSheet);
  const sentThisHour = getSentCurrentHourCount_(logSheet);
  const suppressedStatuses = {};
  suppressedStatuses[STATUS.OPTOUT] = true;
  suppressedStatuses[STATUS.SUPPRESSED_OPTOUT] = true;
  suppressedStatuses[STATUS.SUPPRESSED_BOUNCE] = true;
  suppressedStatuses[STATUS.HOLD] = true;
  suppressedStatuses[STATUS.CLOSED_LOST] = true;
  suppressedStatuses[STATUS.CLOSED_WON] = true;

  for (var i = 0; i < prospectsData.rows.length; i++) {
    if (sentCount >= runCap) {
      break;
    }

    if (sentThisHour + sentCount >= maxSendsPerHour) {
      break;
    }

    if (sentTodayAll + sentCount >= warmupDailyLimit) {
      break;
    }

    if (mode === 'new' && sentTodayNew + sentCount >= dailyCap) {
      break;
    }

    const row = prospectsData.rows[i];
    const status = String(row[pIdx.status] || '').trim();
    const email = String(row[pIdx.email] || '').trim();
    const nextTouch = toDate_(row[pIdx.next_touch_at]);

    if (!email) {
      continue;
    }

    if (suppressedStatuses[status]) {
      continue;
    }

    if (nextTouch && nextTouch.getTime() > now.getTime()) {
      continue;
    }

    let step = '';
    if (mode === 'new' && status === STATUS.READY) {
      step = OUTREACH_STEPS.STEP_1;
    }

    if (mode === 'followup' && status === STATUS.FOLLOWUP_1_DUE) {
      step = OUTREACH_STEPS.STEP_2;
    }

    if (mode === 'followup' && status === STATUS.FOLLOWUP_2_DUE) {
      step = OUTREACH_STEPS.STEP_3;
    }

    if (!step) {
      continue;
    }

    const prospectTimezone = resolveProspectTimezone_(row, pIdx, settings);
    if (isWithinQuietHours_(now, prospectTimezone, settings)) {
      continue;
    }

    const messageId = buildId_('MSG');

    if (!isValidEmail_(email)) {
      row[pIdx.status] = STATUS.SUPPRESSED_BOUNCE;
      row[pIdx.next_touch_at] = '';
      row[pIdx.last_error] = 'invalid_email_format';
      logs.push([
        row[pIdx.id],
        step,
        'email',
        '',
        '[SEND_ERROR] invalid_email_format',
        now,
        'error',
        'failed',
        'invalid_email_format',
        messageId
      ]);
      continue;
    }

    const prospect = rowToObject_(prospectsData.headers, row);
    const message = buildOutreachMessage_(step, prospect, settings);

    try {
      const sendResult = sendEmail_(email, message.subject, message.body, settings, false, messageId);
      sentCount++;

      row[pIdx.last_touch_at] = now;
      row[pIdx.last_error] = '';
      if (row[pIdx.status] !== STATUS.SUPPRESSED_OPTOUT) {
        row[pIdx.do_not_contact_reason] = '';
      }
      if (step === OUTREACH_STEPS.STEP_1) {
        row[pIdx.status] = STATUS.FOLLOWUP_1_DUE;
        row[pIdx.next_touch_at] = addHours_(now, 24);
      } else if (step === OUTREACH_STEPS.STEP_2) {
        row[pIdx.status] = STATUS.FOLLOWUP_2_DUE;
        row[pIdx.next_touch_at] = addHours_(now, 48);
      } else {
        row[pIdx.status] = STATUS.COMPLETED_OUTREACH;
        row[pIdx.next_touch_at] = '';
      }

      logs.push([
        row[pIdx.id],
        step,
        'email',
        message.subject,
        message.body,
        now,
        '',
        sendResult.deliveryStatus,
        '',
        sendResult.messageId || messageId
      ]);
    } catch (err) {
      const sendError = String(err || '');
      const errorCode = classifySendErrorCode_(sendError);
      if (errorCode === 'bounce') {
        row[pIdx.status] = STATUS.SUPPRESSED_BOUNCE;
      } else {
        row[pIdx.status] = STATUS.HOLD;
      }
      row[pIdx.next_touch_at] = '';
      row[pIdx.last_error] = sendError;
      logs.push([
        row[pIdx.id],
        step,
        'email',
        message.subject,
        '[SEND_ERROR] ' + sendError,
        now,
        'error',
        'failed',
        errorCode,
        messageId
      ]);
    }
  }

  writeBackRows_(prospectsSheet, prospectsData.headers, prospectsData.rows);
  if (logs.length) {
    appendRows_(logSheet, logs);
  }

  Logger.log('runOutreachStep mode=' + mode + ', sent=' + sentCount);
  return { mode: mode, sent: sentCount };
}

function runReplyTriage() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settings = getSettings_();

  const inboxSheet = ss.getSheetByName(SHEETS.REPLIES_INBOX);
  const prospectsSheet = ss.getSheetByName(SHEETS.PROSPECTS);
  const dealsSheet = ss.getSheetByName(SHEETS.DEALS);
  const outreachLogSheet = ss.getSheetByName(SHEETS.OUTREACH_LOG);

  const inboxData = getSheetData_(inboxSheet);
  const prospectsData = getSheetData_(prospectsSheet);
  const dealsData = getSheetData_(dealsSheet);

  const iIdx = indexMap_(inboxData.headers);
  const pIdx = indexMap_(prospectsData.headers);
  const dIdx = indexMap_(dealsData.headers);

  const prospectById = {};
  const prospectByEmail = {};
  prospectsData.rows.forEach(function (row, rowIndex) {
    const id = String(row[pIdx.id] || '').trim();
    const email = normalize_(row[pIdx.email]);
    if (id) {
      prospectById[id] = rowIndex;
    }
    if (email) {
      prospectByEmail[email] = rowIndex;
    }
  });

  const logs = [];
  let processed = 0;
  const now = new Date();

  inboxData.rows.forEach(function (row) {
    if (row[iIdx.processed_at]) {
      return;
    }

    const replyBody = String(row[iIdx.body] || '').trim();
    const replyClass = classifyReply(replyBody);
    row[iIdx.reply_class] = replyClass;
    row[iIdx.processed_at] = now;
    processed++;

    const prospectId = String(row[iIdx.prospect_id] || '').trim();
    const email = normalize_(row[iIdx.email]);

    let prospectRowIndex = -1;
    if (prospectId && Object.prototype.hasOwnProperty.call(prospectById, prospectId)) {
      prospectRowIndex = prospectById[prospectId];
    } else if (email && Object.prototype.hasOwnProperty.call(prospectByEmail, email)) {
      prospectRowIndex = prospectByEmail[email];
    }

    if (prospectRowIndex < 0) {
      return;
    }

    const prospectRow = prospectsData.rows[prospectRowIndex];
    const resolvedProspectId = prospectRow[pIdx.id];

    if (replyClass === 'positive') {
      prospectRow[pIdx.status] = STATUS.POSITIVE_REPLY;
      prospectRow[pIdx.next_touch_at] = '';
      prospectRow[pIdx.last_touch_at] = now;
      prospectRow[pIdx.last_error] = '';
      upsertDealForProspect_(dealsData.rows, dIdx, resolvedProspectId, settings);
      sendCalendlyInvite_(prospectRow[pIdx.email], prospectRow[pIdx.business_name], settings);
    } else if (replyClass === 'neutral') {
      prospectRow[pIdx.status] = STATUS.NEUTRAL_REPLY;
      prospectRow[pIdx.next_touch_at] = addHours_(now, 24);
      prospectRow[pIdx.last_touch_at] = now;
      prospectRow[pIdx.last_error] = '';
    } else if (replyClass === 'negative') {
      prospectRow[pIdx.status] = STATUS.NEGATIVE_REPLY;
      prospectRow[pIdx.next_touch_at] = '';
      prospectRow[pIdx.last_touch_at] = now;
      prospectRow[pIdx.last_error] = '';
    } else if (replyClass === 'optout') {
      prospectRow[pIdx.status] = STATUS.SUPPRESSED_OPTOUT;
      prospectRow[pIdx.next_touch_at] = '';
      prospectRow[pIdx.last_touch_at] = now;
      prospectRow[pIdx.optout_at] = now;
      prospectRow[pIdx.do_not_contact_reason] = 'user_optout';
      prospectRow[pIdx.last_error] = '';
    }

    logs.push([
      resolvedProspectId,
      OUTREACH_STEPS.REPLY_AUTOMATION,
      'email',
      'Inbound reply triaged',
      replyBody,
      now,
      replyClass,
      'received',
      '',
      row[iIdx.message_id] || ''
    ]);
  });

  writeBackRows_(inboxSheet, inboxData.headers, inboxData.rows);
  writeBackRows_(prospectsSheet, prospectsData.headers, prospectsData.rows);
  writeBackRows_(dealsSheet, dealsData.headers, dealsData.rows);

  if (logs.length) {
    appendRows_(outreachLogSheet, logs);
  }

  Logger.log('runReplyTriage processed=' + processed);
  return { processed: processed };
}

function runPipelineDigest() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settings = getSettings_();

  if (!settings.OPERATOR_EMAIL) {
    Logger.log('runPipelineDigest skipped: OPERATOR_EMAIL missing');
    return { sent: false, reason: 'OPERATOR_EMAIL missing' };
  }

  const prospectsData = getSheetData_(ss.getSheetByName(SHEETS.PROSPECTS));
  const dealsData = getSheetData_(ss.getSheetByName(SHEETS.DEALS));
  const paymentsData = getSheetData_(ss.getSheetByName(SHEETS.PAYMENTS));
  const outreachData = getSheetData_(ss.getSheetByName(SHEETS.OUTREACH_LOG));

  const pIdx = indexMap_(prospectsData.headers);
  const dIdx = indexMap_(dealsData.headers);
  const payIdx = indexMap_(paymentsData.headers);
  const outIdx = indexMap_(outreachData.headers);

  const now = new Date();
  const todaySends = outreachData.rows.filter(function (row) {
    return (
      isSameDay_(toDate_(row[outIdx.sent_at]), now) &&
      ['step_1', 'step_2', 'step_3'].indexOf(String(row[outIdx.step] || '').trim()) >= 0
    );
  }).length;

  const todayReplies = outreachData.rows.filter(function (row) {
    return isSameDay_(toDate_(row[outIdx.sent_at]), now) && String(row[outIdx.reply_class] || '').trim() !== '';
  }).length;

  const positiveReplies = prospectsData.rows.filter(function (row) {
    return String(row[pIdx.status] || '').trim() === STATUS.POSITIVE_REPLY;
  }).length;

  const bookedCalls = dealsData.rows.filter(function (row) {
    return String(row[dIdx.stage] || '').trim() === 'call_booked';
  }).length;

  const paidRows = paymentsData.rows.filter(function (row) {
    return String(row[payIdx.status] || '').trim() === 'paid';
  });

  const revenue = paidRows.reduce(function (sum, row) {
    return sum + toFloat_(row[payIdx.amount], 0);
  }, 0);

  const body = [
    'Survival Cash Engine Daily Digest',
    '',
    'Date: ' + now,
    'Total Prospects: ' + prospectsData.rows.length,
    'Sends Today: ' + todaySends,
    'Replies Classified Today: ' + todayReplies,
    'Positive Reply Prospects: ' + positiveReplies,
    'Booked Calls: ' + bookedCalls,
    'Deposits Collected: ' + paidRows.length,
    'Cash Collected: $' + revenue.toFixed(2),
    '',
    'Reply Rate Snapshot: ' + getReplyRateSnapshot_(outreachData.rows, outIdx),
    'Pivot Recommendation: ' + getPivotRecommendation_()
  ].join('\n');

  sendEmail_(settings.OPERATOR_EMAIL, '[Digest] Survival Cash Engine', body, settings, true);
  return { sent: true, revenue: revenue };
}

function doPost(e) {
  try {
    const route = parseRoute_(e);
    if (route === 'stripe-webhook') {
      return handleStripeWebhook_(e);
    }
    if (route === 'reply-hook') {
      return handleReplyHook_(e);
    }
    return jsonResponse_(404, { ok: false, error: 'Unknown route: ' + route });
  } catch (err) {
    return jsonResponse_(500, { ok: false, error: String(err) });
  }
}

function handleStripeWebhook_(e) {
  const payload = parseJsonPayload_(e);
  const settings = getSettings_();

  const stripeValidation = validateRequiredKeys_(payload, ['webhook_token', 'event_id', 'payment_id', 'amount', 'status']);
  if (!stripeValidation.ok) {
    return jsonResponse_(400, { ok: false, error: stripeValidation.error });
  }
  if (!isFinite(Number(payload.amount))) {
    return jsonResponse_(400, { ok: false, error: 'Invalid amount. Expected numeric value.' });
  }

  const token = String(payload.webhook_token || '');
  if (settings.STRIPE_WEBHOOK_TOKEN && token !== settings.STRIPE_WEBHOOK_TOKEN) {
    return jsonResponse_(401, { ok: false, error: 'Invalid webhook token' });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const paymentsSheet = ss.getSheetByName(SHEETS.PAYMENTS);
  const dealsSheet = ss.getSheetByName(SHEETS.DEALS);
  const deliverySheet = ss.getSheetByName(SHEETS.DELIVERY);

  const paymentsData = getSheetData_(paymentsSheet);
  const dealsData = getSheetData_(dealsSheet);
  const deliveryData = getSheetData_(deliverySheet);

  const payIdx = indexMap_(paymentsData.headers);
  const dealIdx = indexMap_(dealsData.headers);
  const deliveryIdx = indexMap_(deliveryData.headers);

  const event = normalizeStripeEvent_(payload);
  if (!event.stripeEventId) {
    return jsonResponse_(400, { ok: false, error: 'Missing stripe event id' });
  }

  const duplicate = paymentsData.rows.some(function (row) {
    return String(row[payIdx.stripe_event_id] || '').trim() === event.stripeEventId;
  });

  if (duplicate) {
    return jsonResponse_(200, { ok: true, duplicate: true, stripe_event_id: event.stripeEventId });
  }

  paymentsData.rows.push([
    event.paymentId,
    event.dealId,
    event.amount,
    event.status,
    event.paidAt,
    event.stripeEventId
  ]);

  const dealRowIndex = findDealRowIndex_(dealsData.rows, dealIdx, event.dealId, event.prospectId);
  if (dealRowIndex >= 0) {
    dealsData.rows[dealRowIndex][dealIdx.stage] = 'deposit_paid';
  } else {
    dealsData.rows.push([
      event.dealId || buildId_('DL'),
      event.prospectId || '',
      'deposit_paid',
      toFloat_(event.amount, toFloat_(settings.DEFAULT_QUOTED_PRICE, 1500)),
      '',
      ''
    ]);
  }

  ensureDeliveryRow_(deliveryData.rows, deliveryIdx, event.clientId || event.prospectId || event.dealId || buildId_('CL'));

  writeBackRows_(paymentsSheet, paymentsData.headers, paymentsData.rows);
  writeBackRows_(dealsSheet, dealsData.headers, dealsData.rows);
  writeBackRows_(deliverySheet, deliveryData.headers, deliveryData.rows);

  return jsonResponse_(200, { ok: true, duplicate: false, payment_id: event.paymentId });
}

function handleReplyHook_(e) {
  const payload = parseJsonPayload_(e);
  const replyValidation = validateRequiredKeys_(payload, ['reply_id', 'email', 'body', 'received_at', 'message_id']);
  if (!replyValidation.ok) {
    return jsonResponse_(400, { ok: false, error: replyValidation.error });
  }
  if (!toDate_(payload.received_at)) {
    return jsonResponse_(400, { ok: false, error: 'Invalid received_at. Expected ISO timestamp.' });
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const inboxSheet = ss.getSheetByName(SHEETS.REPLIES_INBOX);

  const inboxData = getSheetData_(inboxSheet);
  const iIdx = indexMap_(inboxData.headers);

  const replyId = String(payload.reply_id || '').trim();
  const exists = inboxData.rows.some(function (row) {
    return String(row[iIdx.reply_id] || '').trim() === replyId;
  });

  if (!exists) {
    inboxData.rows.push([
      replyId,
      payload.prospect_id || '',
      payload.email || '',
      payload.body || payload.text || '',
      payload.received_at || new Date(),
      '',
      '',
      payload.message_id || ''
    ]);
    writeBackRows_(inboxSheet, inboxData.headers, inboxData.rows);
  }

  runReplyTriage();
  return jsonResponse_(200, { ok: true, duplicate: exists, reply_id: replyId });
}

function classifyReply(text) {
  const body = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!body) {
    return 'neutral';
  }

  const optOutPatterns = [
    'unsubscribe',
    'stop',
    'remove me',
    'do not contact',
    "don't contact",
    'opt out'
  ];

  const negativePatterns = [
    'not interested',
    'no thanks',
    'no thank you',
    'already solved',
    'already have',
    'leave us alone'
  ];

  const positivePatterns = [
    'interested',
    'yes',
    'sounds good',
    'book',
    'schedule',
    'call me',
    'lets do it',
    "let's do it",
    'pricing',
    'price',
    'how much',
    'send details'
  ];

  if (containsAny_(body, optOutPatterns)) {
    return 'optout';
  }
  if (containsAny_(body, negativePatterns)) {
    return 'negative';
  }
  if (containsAny_(body, positivePatterns)) {
    return 'positive';
  }
  return 'neutral';
}

function seedDemoData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.LEAD_INTAKE);
  const sample = [
    [
      buildId_('LI'),
      'Glow Med Spa',
      'med spa',
      'Austin',
      'https://example.com',
      'owner+glow@example.com',
      'https://linkedin.com/company/glow',
      'No online booking link on homepage',
      Session.getActiveUser().getEmail(),
      'manual_seed',
      ''
    ],
    [
      buildId_('LI'),
      'Riverfront Dental',
      'dental',
      'Dallas',
      'https://example.org',
      'ops+riverfront@example.com',
      'https://linkedin.com/company/riverfront',
      'No same-day callback mention',
      Session.getActiveUser().getEmail(),
      'manual_seed',
      ''
    ]
  ];

  appendRows_(sheet, sample);
}

function runSmokeChecks() {
  const checks = [];
  checks.push(assertEquals_('positive', classifyReply('Interested. Send pricing and a booking link.'), 'classify positive'));
  checks.push(assertEquals_('negative', classifyReply('No thanks, not interested.'), 'classify negative'));
  checks.push(assertEquals_('optout', classifyReply('Please unsubscribe and remove me.'), 'classify optout'));
  checks.push(assertEquals_('neutral', classifyReply('Can you clarify what you do?'), 'classify neutral'));
  checks.push(assertEquals_(true, validateRequiredKeys_({ event_id: 'x' }, ['event_id']).ok, 'validate required key present'));
  checks.push(assertEquals_(false, validateRequiredKeys_({ event_id: '' }, ['event_id']).ok, 'validate required key blank'));
  checks.push(assertEquals_(true, isValidEmail_('owner@example.com'), 'valid email format'));
  checks.push(assertEquals_(false, isValidEmail_('owner@example'), 'invalid email format'));
  checks.push(
    assertEquals_(
      true,
      isWithinQuietHours_(new Date('2026-02-28T03:00:00Z'), 'America/New_York', {
        QUIET_HOURS_START: '20',
        QUIET_HOURS_END: '08'
      }),
      'quiet hour detection'
    )
  );

  const passed = checks.filter(function (x) {
    return x.ok;
  }).length;
  const failed = checks.length - passed;

  Logger.log(JSON.stringify({ passed: passed, failed: failed, checks: checks }, null, 2));
  return { passed: passed, failed: failed, checks: checks };
}

function buildOutreachMessage_(step, prospect, settings) {
  const context = {
    BUSINESS_NAME: prospect.business_name || 'your clinic',
    NICHE: prospect.niche || 'clinic',
    CITY: prospect.city || 'your city',
    PAIN_SIGNAL: prospect.pain_signal || 'missed inbound leads',
    CALENDLY_LINK: settings.CALENDLY_LINK || '[insert-calendly-link]',
    OFFER_NAME: settings.OFFER_NAME || DEFAULT_SETTINGS.OFFER_NAME,
    STRIPE_DEPOSIT_LINK: settings.STRIPE_DEPOSIT_LINK || '[insert-deposit-link]'
  };

  if (step === OUTREACH_STEPS.STEP_1) {
    return {
      subject: renderTemplate_('Quick idea to recover missed {{NICHE}} leads for {{BUSINESS_NAME}}', context),
      body: renderTemplate_(
        [
          'Hi {{BUSINESS_NAME}} team,',
          '',
          'I noticed {{PAIN_SIGNAL}}.',
          'I run a 14-day sprint that reactivates old leads and routes hot replies straight to your booking flow.',
          '',
          'Would you be open to a quick 15-minute fit check this week?',
          '{{CALENDLY_LINK}}',
          '',
          'If not relevant, reply STOP and I will not follow up.',
          '',
          '- {{OFFER_NAME}}'
        ].join('\n'),
        context
      )
    };
  }

  if (step === OUTREACH_STEPS.STEP_2) {
    return {
      subject: renderTemplate_('Follow-up: missed lead recovery for {{BUSINESS_NAME}}', context),
      body: renderTemplate_(
        [
          'Hi {{BUSINESS_NAME}} team,',
          '',
          'Quick follow-up in case this got buried.',
          'We typically recover booked consults from old lead lists in the first 14 days.',
          '',
          'If useful, pick a slot here:',
          '{{CALENDLY_LINK}}',
          '',
          'Reply STOP to opt out.',
          '',
          '- {{OFFER_NAME}}'
        ].join('\n'),
        context
      )
    };
  }

  return {
    subject: renderTemplate_('Last note on reactivation for {{BUSINESS_NAME}}', context),
    body: renderTemplate_(
      [
        'Hi {{BUSINESS_NAME}} team,',
        '',
        'Last note from me.',
        'If recovering unworked leads is a priority this month, this is the direct booking link:',
        '{{CALENDLY_LINK}}',
        '',
        'If you prefer to start directly, deposit link:',
        '{{STRIPE_DEPOSIT_LINK}}',
        '',
        'Reply STOP to opt out.',
        '',
        '- {{OFFER_NAME}}'
      ].join('\n'),
      context
    )
  };
}

function sendCalendlyInvite_(recipientEmail, businessName, settings) {
  if (!recipientEmail) {
    return;
  }

  const subject = 'Quick scheduling link for lead reactivation at ' + (businessName || 'your clinic');
  const body = [
    'Thanks for the reply.',
    '',
    'Here is the 15-minute fit-check link:',
    settings.CALENDLY_LINK || '[insert-calendly-link]',
    '',
    'If we are a fit, you can secure implementation with this deposit link:',
    settings.STRIPE_DEPOSIT_LINK || '[insert-deposit-link]'
  ].join('\n');

  sendEmail_(recipientEmail, subject, body, settings);
}

function sendEmail_(to, subject, body, settings, forceRealSend, messageId) {
  const dryRun = String(settings.DRY_RUN || 'TRUE').toUpperCase() === 'TRUE';
  if (dryRun && !forceRealSend) {
    Logger.log('[DRY_RUN] To: ' + to + ' | Subject: ' + subject + '\n' + body);
    return {
      deliveryStatus: 'dry_run',
      messageId: messageId || buildId_('MSG')
    };
  }

  GmailApp.sendEmail(to, subject, body, {
    name: settings.SENDER_NAME || DEFAULT_SETTINGS.SENDER_NAME
  });

  return {
    deliveryStatus: 'sent',
    messageId: messageId || buildId_('MSG')
  };
}

function upsertDealForProspect_(dealRows, dIdx, prospectId, settings) {
  var existingIndex = -1;
  for (var i = 0; i < dealRows.length; i++) {
    if (String(dealRows[i][dIdx.prospect_id] || '').trim() === String(prospectId || '').trim()) {
      existingIndex = i;
      break;
    }
  }

  if (existingIndex >= 0) {
    dealRows[existingIndex][dIdx.stage] = 'interested';
    if (!dealRows[existingIndex][dIdx.quoted_price]) {
      dealRows[existingIndex][dIdx.quoted_price] = toFloat_(settings.DEFAULT_QUOTED_PRICE, 1500);
    }
    return;
  }

  dealRows.push([
    buildId_('DL'),
    prospectId,
    'interested',
    toFloat_(settings.DEFAULT_QUOTED_PRICE, 1500),
    '',
    ''
  ]);
}

function ensureDeliveryRow_(deliveryRows, deliveryIdx, clientId) {
  const exists = deliveryRows.some(function (row) {
    return String(row[deliveryIdx.client_id] || '').trim() === String(clientId || '').trim();
  });

  if (!exists) {
    deliveryRows.push([clientId, 'pending', 'pending', 'pending', 'pending']);
  }
}

function findDealRowIndex_(dealRows, dIdx, dealId, prospectId) {
  for (var i = 0; i < dealRows.length; i++) {
    const idMatches = dealId && String(dealRows[i][dIdx.deal_id] || '').trim() === String(dealId).trim();
    const prospectMatches =
      prospectId && String(dealRows[i][dIdx.prospect_id] || '').trim() === String(prospectId).trim();
    if (idMatches || prospectMatches) {
      return i;
    }
  }
  return -1;
}

function normalizeStripeEvent_(payload) {
  const now = new Date();
  const root = payload || {};
  const hasStripeObject = !!(root.data && root.data.object);
  const rawObject = hasStripeObject ? root.data.object : root;

  const stripeEventId = String(root.event_id || root.id || rawObject.event_id || '').trim();
  const paymentId = String(rawObject.payment_intent || rawObject.payment_id || rawObject.id || buildId_('PM')).trim();
  const amountValue =
    rawObject.amount_total || rawObject.amount_received || rawObject.amount || root.amount || root.amount_total || 0;
  const numericAmount = Number(amountValue);
  const amount = hasStripeObject ? numericAmount / 100 : numericAmount;

  const metadata = rawObject.metadata || root.metadata || {};
  const paidAtCandidate = root.paid_at
    ? new Date(root.paid_at)
    : rawObject.created
      ? new Date(Number(rawObject.created) * 1000)
      : now;
  const paidAt = isNaN(paidAtCandidate.getTime()) ? now : paidAtCandidate;

  return {
    stripeEventId: stripeEventId,
    paymentId: paymentId,
    dealId: String(metadata.deal_id || root.deal_id || '').trim(),
    prospectId: String(metadata.prospect_id || root.prospect_id || '').trim(),
    clientId: String(metadata.client_id || root.client_id || '').trim(),
    amount: isFinite(amount) ? amount : 0,
    status: String(root.status || rawObject.payment_status || 'paid').trim(),
    paidAt: paidAt
  };
}

function getPivotRecommendation_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const settings = getSettings_();
  const outreachData = getSheetData_(ss.getSheetByName(SHEETS.OUTREACH_LOG));
  const outIdx = indexMap_(outreachData.headers);

  const sentCount = outreachData.rows.filter(function (row) {
    return ['step_1', 'step_2', 'step_3'].indexOf(String(row[outIdx.step] || '').trim()) >= 0;
  }).length;

  const positiveCount = outreachData.rows.filter(function (row) {
    return String(row[outIdx.reply_class] || '').trim() === 'positive';
  }).length;

  if (sentCount < 150) {
    return 'Hold current niche until at least 150 sends are logged.';
  }

  const replyRate = sentCount > 0 ? positiveCount / sentCount : 0;
  const floor = toFloat_(settings.PIVOT_REPLY_RATE_FLOOR, 0.01);

  if (replyRate < floor) {
    return 'Pivot from med spas/dental to roofing/HVAC for the next batch.';
  }

  return 'Stay with med spas/dental; reply rate above pivot floor.';
}

function getReplyRateSnapshot_(outreachRows, outIdx) {
  const sends = outreachRows.filter(function (row) {
    return ['step_1', 'step_2', 'step_3'].indexOf(String(row[outIdx.step] || '').trim()) >= 0;
  }).length;

  const positives = outreachRows.filter(function (row) {
    return String(row[outIdx.reply_class] || '').trim() === 'positive';
  }).length;

  const rate = sends ? (positives / sends) * 100 : 0;
  return positives + '/' + sends + ' positive (' + rate.toFixed(2) + '%)';
}

function getSentTodayCount_(logSheet) {
  const data = getSheetData_(logSheet);
  const idx = indexMap_(data.headers);
  const now = new Date();

  return data.rows.filter(function (row) {
    return isSameDay_(toDate_(row[idx.sent_at]), now) && String(row[idx.step] || '').trim() === 'step_1';
  }).length;
}

function getSentTodayAllCount_(logSheet) {
  const data = getSheetData_(logSheet);
  const idx = indexMap_(data.headers);
  const now = new Date();

  return data.rows.filter(function (row) {
    return (
      isSameDay_(toDate_(row[idx.sent_at]), now) &&
      ['step_1', 'step_2', 'step_3'].indexOf(String(row[idx.step] || '').trim()) >= 0
    );
  }).length;
}

function getSentCurrentHourCount_(logSheet) {
  const data = getSheetData_(logSheet);
  const idx = indexMap_(data.headers);
  const now = new Date();

  return data.rows.filter(function (row) {
    const sentAt = toDate_(row[idx.sent_at]);
    if (!sentAt) {
      return false;
    }
    const step = String(row[idx.step] || '').trim();
    if (['step_1', 'step_2', 'step_3'].indexOf(step) < 0) {
      return false;
    }
    return (
      sentAt.getFullYear() === now.getFullYear() &&
      sentAt.getMonth() === now.getMonth() &&
      sentAt.getDate() === now.getDate() &&
      sentAt.getHours() === now.getHours()
    );
  }).length;
}

function getSettings_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.SETTINGS);
  const data = getSheetData_(sheet);
  const idx = indexMap_(data.headers);

  const output = {};
  Object.keys(DEFAULT_SETTINGS).forEach(function (key) {
    output[key] = DEFAULT_SETTINGS[key];
  });

  data.rows.forEach(function (row) {
    const key = String(row[idx.key] || '').trim();
    const value = row[idx.value];
    if (key) {
      output[key] = value;
    }
  });

  return output;
}

function seedDefaultSettings_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(SHEETS.SETTINGS);
  const data = getSheetData_(sheet);
  const idx = indexMap_(data.headers);

  const existing = {};
  data.rows.forEach(function (row) {
    const key = String(row[idx.key] || '').trim();
    if (key) {
      existing[key] = true;
    }
  });

  const missing = [];
  Object.keys(DEFAULT_SETTINGS).forEach(function (key) {
    if (!existing[key]) {
      missing.push([key, DEFAULT_SETTINGS[key]]);
    }
  });

  if (missing.length) {
    appendRows_(sheet, missing);
  }
}

function parseRoute_(e) {
  if (!e) {
    return '';
  }

  const pathInfo = e.pathInfo ? String(e.pathInfo) : '';
  if (pathInfo) {
    return pathInfo.replace(/^\/+/, '').toLowerCase();
  }

  const parameter = e.parameter || {};
  const route = parameter.route || parameter.path || '';
  return String(route).replace(/^\/+/, '').toLowerCase();
}

function parseJsonPayload_(e) {
  if (!e || !e.postData || !e.postData.contents) {
    return {};
  }

  try {
    return JSON.parse(e.postData.contents);
  } catch (err) {
    throw new Error('Invalid JSON payload: ' + err);
  }
}

function validateRequiredKeys_(payload, requiredKeys) {
  const missing = [];
  requiredKeys.forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(payload || {}, key) || payload[key] === '' || payload[key] === null) {
      missing.push(key);
    }
  });

  if (!missing.length) {
    return { ok: true };
  }

  return {
    ok: false,
    error: 'Missing required fields: ' + missing.join(', ')
  };
}

function jsonResponse_(status, payload) {
  const responseBody = {};
  Object.keys(payload || {}).forEach(function (key) {
    responseBody[key] = payload[key];
  });
  responseBody.status_code = status;

  const output = ContentService.createTextOutput(JSON.stringify(responseBody));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}

function ensureSheet_(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);

  if (!sheet) {
    sheet = ss.insertSheet(name);
  }

  const existingColumns = sheet.getMaxColumns();
  if (existingColumns < headers.length) {
    sheet.insertColumnsAfter(existingColumns, headers.length - existingColumns);
  }

  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setFontWeight('bold');
  sheet.setFrozenRows(1);
}

function backfillSheetRows_(sheetName, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return;
  }

  const rowCount = lastRow - 1;
  const range = sheet.getRange(2, 1, rowCount, headers.length);
  const values = range.getValues();
  for (var r = 0; r < values.length; r++) {
    for (var c = 0; c < headers.length; c++) {
      if (typeof values[r][c] === 'undefined') {
        values[r][c] = '';
      }
    }
  }
  range.setValues(values);
}

function getSheetData_(sheet) {
  const data = sheet.getDataRange().getValues();
  if (!data.length) {
    return { headers: [], rows: [] };
  }

  return {
    headers: data[0],
    rows: data.slice(1)
  };
}

function rowToObject_(headers, row) {
  const out = {};
  headers.forEach(function (header, index) {
    out[header] = row[index];
  });
  return out;
}

function indexMap_(headers) {
  const out = {};
  headers.forEach(function (header, index) {
    out[header] = index;
  });
  return out;
}

function writeBackRows_(sheet, headers, rows) {
  const expectedRows = rows.length + 1;
  const existingRows = sheet.getMaxRows();
  const existingCols = sheet.getMaxColumns();

  if (existingCols < headers.length) {
    sheet.insertColumnsAfter(existingCols, headers.length - existingCols);
  }

  if (existingRows < expectedRows) {
    sheet.insertRowsAfter(existingRows, expectedRows - existingRows);
  }

  if (!rows.length) {
    if (sheet.getLastRow() > 1) {
      sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).clearContent();
    }
    return;
  }

  sheet.getRange(2, 1, rows.length, headers.length).setValues(rows);
  if (sheet.getLastRow() > expectedRows) {
    sheet.getRange(expectedRows + 1, 1, sheet.getLastRow() - expectedRows, headers.length).clearContent();
  }
}

function appendRows_(sheet, rows) {
  if (!rows || !rows.length) {
    return;
  }
  const start = sheet.getLastRow() + 1;
  sheet.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
}

function buildId_(prefix) {
  return prefix + '-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmss') + '-' + Math.floor(Math.random() * 10000);
}

function renderTemplate_(template, context) {
  return Object.keys(context).reduce(function (text, key) {
    const pattern = new RegExp('{{' + key + '}}', 'g');
    return text.replace(pattern, String(context[key]));
  }, template);
}

function containsAny_(text, patterns) {
  return patterns.some(function (pattern) {
    return text.indexOf(pattern) >= 0;
  });
}

function normalize_(value) {
  return String(value || '').trim().toLowerCase();
}

function toDate_(value) {
  if (!value) {
    return null;
  }
  if (Object.prototype.toString.call(value) === '[object Date]') {
    return isNaN(value.getTime()) ? null : value;
  }

  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

function resolveProspectTimezone_(row, pIdx, settings) {
  const ownerValue = String(row[pIdx.owner] || '').trim();
  if (/^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/.test(ownerValue)) {
    return ownerValue;
  }
  return String(settings.DEFAULT_OWNER_TZ || 'America/New_York').trim();
}

function isWithinQuietHours_(referenceDate, timezone, settings) {
  const quietStart = toInt_(settings.QUIET_HOURS_START, 20);
  const quietEnd = toInt_(settings.QUIET_HOURS_END, 8);
  const tz = timezone || 'America/New_York';
  let localHour = referenceDate.getHours();
  try {
    localHour = toInt_(Utilities.formatDate(referenceDate, tz, 'H'), referenceDate.getHours());
  } catch (err) {
    localHour = toInt_(Utilities.formatDate(referenceDate, 'America/New_York', 'H'), referenceDate.getHours());
  }

  if (quietStart === quietEnd) {
    return false;
  }

  if (quietStart < quietEnd) {
    return localHour >= quietStart && localHour < quietEnd;
  }

  return localHour >= quietStart || localHour < quietEnd;
}

function isValidEmail_(email) {
  const value = String(email || '').trim();
  if (!value) {
    return false;
  }
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(value);
}

function classifySendErrorCode_(errorText) {
  const text = normalize_(errorText);
  const bounceSignals = ['invalid', 'address not found', 'user unknown', 'no such user', 'bad recipient', 'bounce'];
  if (containsAny_(text, bounceSignals)) {
    return 'bounce';
  }
  return 'send_error';
}

function addHours_(dateObj, hours) {
  return new Date(dateObj.getTime() + hours * 60 * 60 * 1000);
}

function isSameDay_(d1, d2) {
  if (!d1 || !d2) {
    return false;
  }

  return (
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate()
  );
}

function toInt_(value, fallback) {
  const n = parseInt(value, 10);
  return isFinite(n) ? n : fallback;
}

function toFloat_(value, fallback) {
  const n = parseFloat(value);
  return isFinite(n) ? n : fallback;
}

function assertEquals_(expected, actual, label) {
  const ok = expected === actual;
  return {
    ok: ok,
    label: label,
    expected: expected,
    actual: actual
  };
}
