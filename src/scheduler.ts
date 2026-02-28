import cron from 'node-cron';

import { getSettings, isJobPaused, logJobRun } from './db.js';
import {
  runDailyProspectingBatch,
  runFollowUpBatch,
  runJobByName,
  runOutreachBatch,
  runPipelineDigest,
  runReplyTriage
} from './services/automationService.js';
import { captureException } from './services/telemetryService.js';
import { parseBoolean } from './utils.js';

export function startScheduler(): void {
  const guarded = (jobKey: string, fn: () => Promise<unknown> | unknown) => async () => {
    const settings = getSettings();
    if (!parseBoolean(settings.AUTO_RUN_ENABLED, true)) {
      return;
    }
    if (isJobPaused(jobKey)) {
      return;
    }

    try {
      await fn();
    } catch (error) {
      logJobRun(jobKey, 'error', String(error));
      captureException(error, { scheduler_job: jobKey });
      console.error(`[scheduler:${jobKey}]`, error);
    }
  };

  cron.schedule('5 */6 * * *', guarded('prospecting', () => runDailyProspectingBatch()));
  cron.schedule('10 * * * *', guarded('outreach', () => runOutreachBatch()));
  cron.schedule('20 * * * *', guarded('followups', () => runFollowUpBatch()));
  cron.schedule('*/10 * * * *', guarded('reply-triage', () => runReplyTriage()));
  cron.schedule('*/15 * * * *', guarded('workflow-dispatch', () => runJobByName('workflow-dispatch')));
  cron.schedule('0 21 * * *', guarded('digest', () => runPipelineDigest()));
}
