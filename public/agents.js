const statusBadge = document.querySelector('#agentStatusBadge');
const metricsGrid = document.querySelector('#agentMetricsGrid');
const connectorsBody = document.querySelector('#connectorsTable tbody');
const jobsBody = document.querySelector('#jobsControlTable tbody');
const manualTasksBody = document.querySelector('#manualTasksTable tbody');
const eventsBody = document.querySelector('#eventFeedTable tbody');
const toastEl = document.querySelector('#toast');

let csrfToken = window.localStorage.getItem('agents_csrf') || '';

function showToast(message, type = 'ok') {
  toastEl.textContent = message;
  toastEl.classList.add('show');
  toastEl.style.background = type === 'error' ? '#b42318' : '#111827';
  setTimeout(() => toastEl.classList.remove('show'), 2200);
}

async function agentApi(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };

  if (!['GET', 'HEAD', 'OPTIONS'].includes(String(options.method || 'GET').toUpperCase()) && csrfToken) {
    headers['x-csrf-token'] = csrfToken;
  }

  const response = await fetch(`/api/agents${path}`, {
    credentials: 'same-origin',
    ...options,
    headers
  });
  const data = await response.json();
  if (!response.ok || data.ok === false) {
    throw new Error(typeof data.error === 'string' ? data.error : JSON.stringify(data.error));
  }
  return data;
}

function renderMetrics(metrics) {
  metricsGrid.innerHTML = [
    ['Total Leads', metrics.totalLeads],
    ['Suppressed', metrics.suppressed],
    ['Sends Today', metrics.sendsToday],
    ['Positive Replies', metrics.positiveReplies],
    ['Cash Collected', `$${Number(metrics.cashCollected || 0).toFixed(2)}`]
  ]
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

function renderConnectors(connectors) {
  connectorsBody.innerHTML = connectors
    .map(
      (connector) => `
      <tr>
        <td>${connector.connector}</td>
        <td>${connector.status}</td>
        <td>${connector.details || ''}</td>
        <td>${connector.last_checked_at || connector.checked_at || ''}</td>
        <td><button data-test-connector="${connector.connector}">Test</button></td>
      </tr>
    `
    )
    .join('');

  document.querySelectorAll('[data-test-connector]').forEach((button) => {
    button.addEventListener('click', async () => {
      const name = button.getAttribute('data-test-connector');
      try {
        await agentApi(`/connectors/test/${name}`, { method: 'POST', body: JSON.stringify({}) });
        showToast(`Connector test completed: ${name}`);
        await refreshOverview();
      } catch (error) {
        showToast(String(error), 'error');
      }
    });
  });
}

function renderJobs(jobs) {
  jobsBody.innerHTML = jobs
    .map(
      (job) => `
      <tr>
        <td>${job.key}</td>
        <td>${job.paused ? 'yes' : 'no'}</td>
        <td>${job.last_status}</td>
        <td>${job.last_run_at || ''}</td>
        <td>
          <button data-run-job="${job.key}">Run</button>
          <button data-pause-job="${job.key}" data-current="${job.paused ? '1' : '0'}">${job.paused ? 'Resume' : 'Pause'}</button>
        </td>
      </tr>
    `
    )
    .join('');

  document.querySelectorAll('[data-run-job]').forEach((button) => {
    button.addEventListener('click', async () => {
      const jobKey = button.getAttribute('data-run-job');
      try {
        await agentApi(`/jobs/${jobKey}/run`, { method: 'POST', body: JSON.stringify({}) });
        showToast(`Job run started: ${jobKey}`);
        await refreshOverview();
      } catch (error) {
        showToast(String(error), 'error');
      }
    });
  });

  document.querySelectorAll('[data-pause-job]').forEach((button) => {
    button.addEventListener('click', async () => {
      const jobKey = button.getAttribute('data-pause-job');
      const isPaused = button.getAttribute('data-current') === '1';
      try {
        await agentApi(`/jobs/${jobKey}/pause`, {
          method: 'POST',
          body: JSON.stringify({
            paused: !isPaused,
            reason: !isPaused ? 'paused_from_agents_panel' : ''
          })
        });
        showToast(`${!isPaused ? 'Paused' : 'Resumed'} job: ${jobKey}`);
        await refreshOverview();
      } catch (error) {
        showToast(String(error), 'error');
      }
    });
  });
}

function renderManualTasks(tasks) {
  manualTasksBody.innerHTML = tasks
    .map(
      (task) => `
      <tr>
        <td>${task.id}</td>
        <td>${task.title}</td>
        <td>${task.status}</td>
        <td>${task.owner || ''}</td>
        <td>
          <button data-task-complete="${task.id}">Complete</button>
          <button data-task-progress="${task.id}">In Progress</button>
        </td>
      </tr>
    `
    )
    .join('');

  document.querySelectorAll('[data-task-complete]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.getAttribute('data-task-complete');
      try {
        await agentApi(`/manual-tasks/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'completed' })
        });
        showToast(`Task ${id} marked completed`);
        await refreshOverview();
      } catch (error) {
        showToast(String(error), 'error');
      }
    });
  });

  document.querySelectorAll('[data-task-progress]').forEach((button) => {
    button.addEventListener('click', async () => {
      const id = button.getAttribute('data-task-progress');
      try {
        await agentApi(`/manual-tasks/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'in_progress' })
        });
        showToast(`Task ${id} marked in progress`);
        await refreshOverview();
      } catch (error) {
        showToast(String(error), 'error');
      }
    });
  });
}

function renderEvents(events) {
  eventsBody.innerHTML = events
    .map(
      (event) => `
      <tr>
        <td>${event.event_type}</td>
        <td>${event.correlation_id}</td>
        <td>${event.severity}</td>
        <td>${event.created_at}</td>
      </tr>
    `
    )
    .join('');
}

async function refreshOverview() {
  try {
    const me = await agentApi('/session/me');
    statusBadge.textContent = `Authenticated • expires ${new Date(me.data.expires_at).toLocaleString()}`;
  } catch {
    statusBadge.textContent = 'Not authenticated';
    return;
  }

  try {
    const overview = await agentApi('/overview');
    renderMetrics(overview.data.metrics);
    renderConnectors(overview.data.connectors);
    renderJobs(overview.data.jobs);
    renderManualTasks(overview.data.manual_tasks);
    renderEvents(overview.data.events);
  } catch (error) {
    showToast(String(error), 'error');
  }
}

document.querySelector('#agentLoginForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const token = document.querySelector('#agentToken').value.trim();
  if (!token) {
    showToast('Enter admin token', 'error');
    return;
  }

  try {
    const out = await agentApi('/session/login', {
      method: 'POST',
      body: JSON.stringify({ token })
    });
    csrfToken = out.csrf_token || '';
    window.localStorage.setItem('agents_csrf', csrfToken);
    document.querySelector('#agentToken').value = '';
    showToast('Session started');
    await refreshOverview();
  } catch (error) {
    showToast(String(error), 'error');
  }
});

document.querySelector('#agentLogout').addEventListener('click', async () => {
  try {
    await agentApi('/session/logout', {
      method: 'POST',
      body: JSON.stringify({})
    });
  } catch {
    // Ignore logout API failures and still clear local token.
  }

  csrfToken = '';
  window.localStorage.removeItem('agents_csrf');
  statusBadge.textContent = 'Not authenticated';
  showToast('Logged out');
});

document.querySelector('#manualTaskForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const payload = {};
  for (const [key, value] of formData.entries()) {
    payload[key] = String(value);
  }

  try {
    await agentApi('/manual-tasks', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    event.currentTarget.reset();
    showToast('Manual task created');
    await refreshOverview();
  } catch (error) {
    showToast(String(error), 'error');
  }
});

document.querySelector('#refreshOverview').addEventListener('click', refreshOverview);

refreshOverview();
setInterval(refreshOverview, 15000);
