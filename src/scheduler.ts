import cron from 'node-cron';

import { getSettings, logJobRun } from './db.js';
import {
  runDailyProspectingBatch,
  runFollowUpBatch,
  runOutreachBatch,
  runPipelineDigest,
  runReplyTriage
} from './services/automationService.js';
import { parseBoolean } from './utils.js';

export function startScheduler(): void {
  const guarded = (jobName: string, fn: () => Promise<unknown> | unknown) => async () => {
    const settings = getSettings();
    if (!parseBoolean(settings.AUTO_RUN_ENABLED, true)) {
      return;
    }

    try {
      await fn();
    } catch (error) {
      logJobRun(jobName, 'error', String(error));
      console.error(`[scheduler:${jobName}]`, error);
    }
  };

  cron.schedule('5 */6 * * *', guarded('runDailyProspectingBatch', () => runDailyProspectingBatch()));
  cron.schedule('10 * * * *', guarded('runOutreachBatch', () => runOutreachBatch()));
  cron.schedule('20 * * * *', guarded('runFollowUpBatch', () => runFollowUpBatch()));
  cron.schedule('*/10 * * * *', guarded('runReplyTriage', () => runReplyTriage()));
  cron.schedule('0 21 * * *', guarded('runPipelineDigest', () => runPipelineDigest()));
}
