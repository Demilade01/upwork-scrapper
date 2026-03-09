import { Bot, InlineKeyboard } from "grammy";
import { config } from "./config.js";
import { getJobById } from "./store.js";
import { draftProposal } from "./ai-analyzer.js";
import type { UpworkJob } from "./models.js";

export const bot = new Bot(config.TELEGRAM_BOT_TOKEN);

function formatJobCard(job: UpworkJob): string {
  const skills =
    job.skills.length > 0 ? `🛠 *Skills:* ${job.skills.join(", ")}\n` : "";
  const budget = job.budget ? `💰 *Budget:* ${job.budget}\n` : "";
  const country = job.clientCountry
    ? `🌍 *Client:* ${job.clientCountry}\n`
    : "";
  const posted = `🕐 *Posted:* ${job.postedAt.toUTCString()}\n`;

  return (
    `🎙 *${escapeMarkdown(job.title)}*\n\n` +
    `${budget}` +
    `${skills}` +
    `${country}` +
    `${posted}\n` +
    `📋 *Description:*\n${escapeMarkdown(job.description.slice(0, 600))}${job.description.length > 600 ? "…" : ""}\n\n` +
    `🔗 [View on Upwork](${job.url})`
  );
}

function escapeMarkdown(text: string): string {
  // Escape Telegram MarkdownV2 special characters
  return text.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, "\\$1");
}

export async function sendJobAlert(job: UpworkJob): Promise<void> {
  const keyboard = new InlineKeyboard().text(
    "📝 Draft Proposal",
    `draft:${job.jobId}`
  );

  await bot.api.sendMessage(config.TELEGRAM_CHAT_ID, formatJobCard(job), {
    parse_mode: "MarkdownV2",
    reply_markup: keyboard,
    link_preview_options: { is_disabled: true },
  });
}

export function registerCallbackHandlers(): void {
  bot.callbackQuery(/^draft:(.+)$/, async (ctx) => {
    const jobId = ctx.match[1];

    // Acknowledge the button press immediately to remove loading spinner
    await ctx.answerCallbackQuery({ text: "✍️ Generating proposal…" });

    const job = await getJobById(jobId);
    if (!job) {
      await ctx.answerCallbackQuery({
        text: "❌ Job not found in database.",
        show_alert: true,
      });
      return;
    }

    const proposal = await draftProposal(job);

    // Edit the original message to append the proposal and remove the button
    const originalText = ctx.callbackQuery.message?.text ?? "";
    const newText =
      originalText +
      `\n\n━━━━━━━━━━━━━━━━━━\n📝 *Draft Proposal*\n\n${escapeMarkdown(proposal)}`;

    try {
      await ctx.editMessageText(newText, {
        parse_mode: "MarkdownV2",
        link_preview_options: { is_disabled: true },
      });
    } catch {
      // If edit fails (e.g. message too old), send as a new message
      await bot.api.sendMessage(
        config.TELEGRAM_CHAT_ID,
        `📝 *Draft Proposal for job \`${jobId}\`*\n\n${escapeMarkdown(proposal)}`,
        { parse_mode: "MarkdownV2" }
      );
    }
  });
}
