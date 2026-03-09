import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_CHAT_ID: z.string().min(1),
  GROQ_API_KEY: z.string().min(1),
  DATABASE_URL: z.string().url(),
  UPWORK_SEARCH_QUERIES: z
    .string()
    .transform((val) => val.split(",").map((q) => q.trim()).filter(Boolean)),
  POLL_INTERVAL_MINUTES: z.coerce.number().int().positive().default(30),
  FREELANCER_NAME: z.string().default("Your Name"),
  FREELANCER_SKILLS: z
    .string()
    .default("Voice AI, Conversational AI, LiveKit, Deepgram, ElevenLabs"),
  FREELANCER_EXPERIENCE_YEARS: z.coerce.number().int().positive().default(5),
  FREELANCER_BIO: z.string().default(""),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌ Invalid environment variables:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
