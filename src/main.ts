import { initDb } from "./store.js";
import { bot, registerCallbackHandlers } from "./telegram.js";
import { startScheduler } from "./scheduler.js";

async function main(): Promise<void> {
  console.log("🚀 Upwork Voice AI Bot starting…");

  // 1. Initialise Neon Postgres (create table if not exists)
  await initDb();

  // 2. Register the "Draft Proposal" button callback handler
  registerCallbackHandlers();

  // 3. Start the polling scheduler (runs pipeline immediately + on cron)
  startScheduler();

  // 4. Start Grammy bot (handles incoming callback_query from button presses)
  console.log("🤖 Telegram bot listening for interactions…");
  await bot.start();
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
