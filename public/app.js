const settingKeys = [
  'OPERATOR_EMAIL',
  'ADMIN_BOOTSTRAP_TOKEN',
  'CALENDLY_LINK',
  'STRIPE_DEPOSIT_LINK',
  'STRIPE_WEBHOOK_TOKEN',
  'DRY_RUN',
  'MAX_SENDS_PER_HOUR',
  'WARMUP_DAILY_LIMIT',
  'QUIET_HOURS_START',
  'QUIET_HOURS_END',
  'DEFAULT_OWNER_TZ',
  'WEBHOOK_SIGNING_SECRET',
  'N8N_WEBHOOK_BASE',
  'N8N_WEBHOOK_URL',
  'MAKE_WEBHOOK_URL',
  'OPENAI_API_KEY',
  'OPENAI_BASE_URL',
  'OPENAI_MODEL',
  'OPENCLAW_API_KEY',
  'OPENCLAW_BASE_URL',
  'OPENCLAW_MODEL',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'MODEL_PROVIDER_CHAIN',
  'MODEL_CB_FAILURE_THRESHOLD',
  'MODEL_CB_OPEN_SECONDS',
  'SENTRY_DSN',
  'LANGFUSE_BASE_URL',
  'LANGFUSE_PUBLIC_KEY',
  'LANGFUSE_SECRET_KEY',
  'SMTP_HOST',
  'SMTP_PORT',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_SECURE',
  'AUTO_RUN_ENABLED'
];

const toastEl = document.querySelector('#toast');
const settingsForm = document.querySelector('#settingsForm');
const metricsGrid = document.querySelector('#metricsGrid');
const leadsBody = document.querySelector('#leadsTable tbody');
const outreachBody = document.querySelector('#outreachTable tbody');
const jobsBody = document.querySelector('#jobsTable tbody');
const statusBadge = document.querySelector('#statusBadge');

let settingsState = {};

function showToast(message, type = 'ok') {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  toastEl.style.background = type === 'error' ? '#b42318' : '#111827';
  setTimeout(() => toastEl.classList.remove('show'), 2200);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
  }
  return data;
}

function renderSettings(settings) {
  settingsState = settings;
  settingsForm.innerHTML = '';

  for (const key of settingKeys) {
    const wrapper = document.createElement('label');
    wrapper.className = 'setting-item';

    const title = document.createElement('span');
    title.textContent = key;

    const input = document.createElement('input');
    input.name = key;
    input.value = settings[key] ?? '';

    if (key.toLowerCase().includes('token') || key.toLowerCase().includes('key') || key === 'SMTP_PASS') {
      input.type = 'password';
      input.autocomplete = 'off';
    }

    wrapper.append(title, input);
    settingsForm.appendChild(wrapper);
  }
}

function renderMetrics(metrics) {
  const entries = [
    ['Total Leads', metrics.totalLeads],
    ['Suppressed', metrics.suppressed],
    ['Sends Today', metrics.sendsToday],
    ['Positive Replies', metrics.positiveReplies],
    ['Cash Collected', `$${Number(metrics.cashCollected || 0).toFixed(2)}`]
  ];

  metricsGrid.innerHTML = entries
    .map(
      ([label, value]) => `
      <div class="metric">
        <div class="label">${label}</div>
        <div class="value">${value}</div>
      </div>
    `
    )
    .join('');
}

function renderLeads(leads) {
  leadsBody.innerHTML = leads
    .map(
      (lead) => `
    <tr>
      <td>${lead.lead_id}</td>
      <td>${lead.business_name}</td>
      <td>${lead.email}</td>
      <td>${lead.status}</td>
      <td>${lead.next_touch_at || ''}</td>
      <td>${lead.last_error || ''}</td>
    </tr>
  `
    )
    .join('');
}

function renderOutreach(logs) {
  outreachBody.innerHTML = logs
    .map(
      (row) => `
    <tr>
      <td>${row.lead_id || ''}</td>
      <td>${row.step || ''}</td>
      <td>${row.delivery_status || ''}</td>
      <td>${row.error_code || ''}</td>
      <td>${row.sent_at || ''}</td>
    </tr>
  `
    )
    .join('');
}

function renderJobs(jobs) {
  jobsBody.innerHTML = jobs
    .map(
      (row) => `
    <tr>
      <td>${row.job_name}</td>
      <td class="${row.status === 'success' ? 'status-ok' : 'status-bad'}">${row.status}</td>
      <td>${String(row.details || '').slice(0, 140)}</td>
      <td>${row.created_at}</td>
    </tr>
  `
    )
    .join('');
}

async function refreshAll() {
  try {
    const [health, settings, metrics, leads, outreach, jobs] = await Promise.all([
      api('/api/health'),
      api('/api/settings'),
      api('/api/metrics'),
      api('/api/leads'),
      api('/api/logs/outreach?limit=80'),
      api('/api/logs/jobs?limit=80')
    ]);

    statusBadge.textContent = `API OK ${new Date(health.time).toLocaleTimeString()}`;
    renderSettings(settings.data);
    renderMetrics(metrics.data);
    renderLeads(leads.data);
    renderOutreach(outreach.data);
    renderJobs(jobs.data);
  } catch (error) {
    statusBadge.textContent = `API Error: ${String(error)}`;
    showToast(String(error), 'error');
  }
}

document.querySelector('#saveSettings').addEventListener('click', async () => {
  const formData = new FormData(settingsForm);
  const payload = {};
  for (const [key, value] of formData.entries()) {
    payload[key] = String(value);
  }

  try {
    await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    showToast('Settings saved');
    await refreshAll();
  } catch (error) {
    showToast(String(error), 'error');
  }
});

document.querySelector('#leadForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);
  const payload = {};
  for (const [key, value] of formData.entries()) {
    payload[key] = String(value);
  }

  try {
    await api('/api/leads', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    form.reset();
    showToast('Lead created');
    await refreshAll();
  } catch (error) {
    showToast(String(error), 'error');
  }
});

document.querySelector('#bulkImport').addEventListener('click', async () => {
  const raw = document.querySelector('#bulkCsv').value.trim();
  if (!raw) {
    showToast('Paste at least one CSV line', 'error');
    return;
  }

  const rows = raw
    .split('\n')
    .map((line) => line.split(',').map((x) => x.trim()))
    .filter((parts) => parts.length >= 2)
    .map((parts) => ({
      business_name: parts[0],
      email: parts[1],
      niche: parts[2] || 'med spa',
      city: parts[3] || '',
      pain_signal: parts[4] || ''
    }));

  try {
    await api('/api/lead-intake/bulk', {
      method: 'POST',
      body: JSON.stringify({ rows })
    });
    showToast(`Inserted ${rows.length} intake rows`);
    await refreshAll();
  } catch (error) {
    showToast(String(error), 'error');
  }
});

document.querySelector('#promoteIntake').addEventListener('click', async () => {
  try {
    const out = await api('/api/lead-intake/promote', { method: 'POST' });
    showToast(`Promoted intake rows: ${out.data.processed}`);
    await refreshAll();
  } catch (error) {
    showToast(String(error), 'error');
  }
});

document.querySelectorAll('[data-job]').forEach((button) => {
  button.addEventListener('click', async () => {
    const job = button.dataset.job;
    try {
      const out = await api(`/api/jobs/${job}`, { method: 'POST' });
      showToast(`${job} completed`);
      console.log(out.data);
      await refreshAll();
    } catch (error) {
      showToast(String(error), 'error');
    }
  });
});

document.querySelector('#refreshAll').addEventListener('click', refreshAll);

document.querySelector('#generateAgent').addEventListener('click', async () => {
  const prompt = document.querySelector('#agentPrompt').value.trim();
  if (!prompt) {
    showToast('Enter a prompt', 'error');
    return;
  }

  try {
    const out = await api('/api/agent/generate', {
      method: 'POST',
      body: JSON.stringify({ prompt })
    });
    document.querySelector('#agentOutput').textContent = JSON.stringify(out.data, null, 2);
  } catch (error) {
    showToast(String(error), 'error');
  }
});

document.querySelector('#dispatchIntegration').addEventListener('click', async () => {
  const eventName = document.querySelector('#integrationEvent').value.trim();
  const payloadRaw = document.querySelector('#integrationPayload').value.trim() || '{}';
  let payload;

  try {
    payload = JSON.parse(payloadRaw);
  } catch {
    showToast('Invalid integration payload JSON', 'error');
    return;
  }

  try {
    const out = await api('/api/integrations/dispatch', {
      method: 'POST',
      body: JSON.stringify({ event_name: eventName, payload })
    });
    document.querySelector('#integrationOutput').textContent = JSON.stringify(out.data, null, 2);
    showToast('Integration dispatch sent');
  } catch (error) {
    showToast(String(error), 'error');
  }
});

refreshAll();
setInterval(refreshAll, 15000);
