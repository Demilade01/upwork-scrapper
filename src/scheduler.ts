import cron from "node-cron";
import { config } from "./config.js";
import { scrapeJobs } from "./scraper.js";
import { isNew, saveJob } from "./store.js";
import { sendJobAlert } from "./telegram.js";

async function runPipeline(): Promise<void> {
  console.log(`[scheduler] Pipeline started at ${new Date().toISOString()}`);

  try {
    const jobs = await scrapeJobs();

    let newCount = 0;
    for (const job of jobs) {
      if (!(await isNew(job.jobId))) continue;

      // Save first so the callback handler can look it up
      await saveJob(job);

      try {
        await sendJobAlert(job);
        newCount++;
      } catch (err) {
        console.error(`[scheduler] Failed to send alert for job ${job.jobId}:`, err);
      }

      // Small delay between Telegram messages to avoid flood limits
      await new Promise((r) => setTimeout(r, 1000));
    }

    console.log(
      `[scheduler] Done — ${newCount} new job${newCount !== 1 ? "s" : ""} sent`
    );
  } catch (err) {
    console.error("[scheduler] Pipeline error:", err);
  }
}

export function startScheduler(): void {
  // Convert minutes to a cron expression: run every N minutes
  const interval = config.POLL_INTERVAL_MINUTES;
  const cronExpression = `*/${interval} * * * *`;

  console.log(
    `[scheduler] Starting — polling every ${interval} minute${interval !== 1 ? "s" : ""}`
  );

  // Run immediately on startup, then on schedule
  runPipeline();
  cron.schedule(cronExpression, runPipeline);
}
