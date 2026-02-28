import 'dotenv/config';

import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { PORT } from './constants.js';
import { initializeDatabase } from './db.js';
import { agentsRouter } from './routes/agents.js';
import { apiRouter } from './routes/api.js';
import { execRouter } from './routes/exec.js';
import { startScheduler } from './scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicDir = path.resolve(__dirname, '..', 'public');

initializeDatabase();

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(publicDir));

app.use('/api', apiRouter);
app.use('/api/agents', agentsRouter);
app.use('/exec', execRouter);

app.get('/api', (_req, res) => {
  res.json({
    ok: true,
    status_code: 200,
    service: 'survival-cash-engine-prototype',
    docs: '/'
  });
});

app.get('/agents', (_req, res) => {
  res.sendFile(path.join(publicDir, 'agents.html'));
});

app.use((_req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Survival Cash Engine prototype running on http://localhost:${PORT}`);
});

startScheduler();
