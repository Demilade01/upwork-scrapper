import { config } from "./config.js";
import type { UpworkJob } from "./models.js";

const API_BASE = "https://www.upwork.com";

// ── Voice AI keyword filter (zero API cost) ───────────────────────────────────
const VOICE_AI_KEYWORDS = [
  "voice ai", "voice agent", "voice bot", "conversational ai",
  "realtime voice", "real-time voice", "ai phone", "phone agent",
  "speech-to-text", "text-to-speech", "stt", "tts",
  "deepgram", "elevenlabs", "eleven labs", "livekit", "twilio voice",
  "vapi", "retell ai", "retell", "openai realtime", "webrtc audio",
  "sip trunk", "ivr", "voice pipeline", "voice assistant",
  "ai calling", "outbound calling", "inbound calling", "ai call",
  "phone bot", "telephony", "llm voice",
];

function isVoiceAiJob(title: string, description: string): boolean {
  const haystack = `${title} ${description}`.toLowerCase();
  return VOICE_AI_KEYWORDS.some((kw) => haystack.includes(kw));
}

// ── OAuth 2.0 Token Management ────────────────────────────────────────────────
interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt - 60_000) {
    return tokenCache.accessToken;
  }

  const credentials = Buffer.from(
    `${config.UPWORK_CLIENT_ID}:${config.UPWORK_CLIENT_SECRET}`
  ).toString("base64");

  const res = await fetch(`${API_BASE}/api/v3/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: config.UPWORK_REFRESH_TOKEN,
    }).toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${body}`);
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
  };

  tokenCache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };

  return tokenCache.accessToken;
}

// ── Job Search API ─────────────────────────────────────────────────────────────
interface RawJob {
  id?: string;
  title?: string;
  op_description?: string;
  date_created?: string;
  budget?: { amount?: string; currencyCode?: string } | null;
  op_pref_hourly_rate_min?: string;
  op_pref_hourly_rate_max?: string;
  job_type?: string;
  skills?: { skill?: string | string[] };
  op_country?: string;
  url?: string;
}

function parseBudget(job: RawJob): string {
  if (job.job_type === "Hourly" && job.op_pref_hourly_rate_min) {
    const min = job.op_pref_hourly_rate_min;
    const max = job.op_pref_hourly_rate_max;
    return max ? `$${min}-$${max}/hr` : `$${min}+/hr`;
  }
  if (job.budget?.amount) {
    return `$${job.budget.amount} ${job.budget.currencyCode ?? ""}`.trim();
  }
  return "Not specified";
}

function parseSkills(job: RawJob): string[] {
  const raw = job.skills?.skill;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

async function searchJobs(
  query: string,
  accessToken: string
): Promise<UpworkJob[]> {
  const params = new URLSearchParams({ q: query, sort: "recency", paging: "0;20" });

  const res = await fetch(
    `${API_BASE}/api/profiles/v2/search/jobs.json?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!res.ok) {
    console.error(`[scraper] API ${res.status} for query "${query}"`);
    return [];
  }

  const data = (await res.json()) as { jobs?: { job?: RawJob | RawJob[] } };
  const raw = data?.jobs?.job;
  if (!raw) return [];

  const jobList: RawJob[] = Array.isArray(raw) ? raw : [raw];
  const results: UpworkJob[] = [];

  for (const job of jobList) {
    const title = job.title ?? "Untitled";
    const description = job.op_description ?? "";

    if (!isVoiceAiJob(title, description)) continue;

    results.push({
      jobId: (job.id ?? crypto.randomUUID()).replace(/^~/, ""),
      title,
      url: job.url ?? "",
      description,
      budget: parseBudget(job),
      postedAt: job.date_created ? new Date(job.date_created) : new Date(),
      skills: parseSkills(job),
      clientCountry: job.op_country ?? "",
    });
  }

  return results;
}

// ── Public API ─────────────────────────────────────────────────────────────────
export async function scrapeJobs(): Promise<UpworkJob[]> {
  if (!config.UPWORK_REFRESH_TOKEN) {
    console.error(
      "[scraper] UPWORK_REFRESH_TOKEN not set. Run: npm run setup-oauth"
    );
    return [];
  }

  let accessToken: string;
  try {
    accessToken = await getAccessToken();
  } catch (err) {
    console.error("[scraper] Failed to get Upwork access token:", err);
    return [];
  }

  const results = await Promise.all(
    config.UPWORK_SEARCH_QUERIES.map((q) =>
      searchJobs(q, accessToken).catch((err) => {
        console.error(`[scraper] Error for query "${q}":`, err);
        return [] as UpworkJob[];
      })
    )
  );

  const seen = new Set<string>();
  const unique: UpworkJob[] = [];
  for (const batch of results) {
    for (const job of batch) {
      if (!seen.has(job.jobId)) {
        seen.add(job.jobId);
        unique.push(job);
      }
    }
  }

  console.log(`[scraper] ${unique.length} unique voice AI jobs found`);
  return unique;
}
