import RSSParser from "rss-parser";
import { config } from "./config.js";
import type { UpworkJob } from "./models.js";

const parser = new RSSParser({ timeout: 20000 });

const RSS_BASE = "https://www.upwork.com/ab/feed/jobs/rss";

// Full browser-like headers — rss-parser's built-in fetch gets blocked by Upwork.
// We use native Node 22 fetch ourselves and pass the XML string to parseString().
const FETCH_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Cache-Control": "no-cache",
  Pragma: "no-cache",
  Referer: "https://www.upwork.com/",
};

// Local keyword filter — zero API cost, keeps Telegram clean.
// Only jobs matching at least one of these (case-insensitive) are forwarded.
const VOICE_AI_KEYWORDS = [
  "voice ai",
  "voice agent",
  "voice bot",
  "conversational ai",
  "realtime voice",
  "real-time voice",
  "ai phone",
  "phone agent",
  "speech-to-text",
  "text-to-speech",
  "deepgram",
  "elevenlabs",
  "eleven labs",
  "livekit",
  "twilio voice",
  "vapi",
  "retell ai",
  "retell",
  "openai realtime",
  "webrtc audio",
  "sip trunk",
  "ivr",
  "voice pipeline",
  "voice assistant",
  "ai calling",
  "outbound calling",
  "inbound calling",
  "ai call",
  "phone bot",
  "telephony",
  "whisper",
  "tts",
  "llm voice",
];

function isVoiceAiJob(title: string, description: string): boolean {
  const haystack = `${title} ${description}`.toLowerCase();
  return VOICE_AI_KEYWORDS.some((kw) => haystack.includes(kw));
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractJobId(url: string): string {
  const match = url.match(/~([0-9a-f]+)/);
  if (match) return match[1];
  // Fallback: use last path segment
  return url.split("/").filter(Boolean).pop() ?? url;
}

function extractBudget(text: string): string {
  const match = text.match(
    /(Budget|Hourly Range|Fixed[\s-]*Price)[:\s]+([^\n<]+)/i
  );
  return match ? match[2].trim() : "";
}

function extractSkills(text: string): string[] {
  const match = text.match(/Skills?[:\s]+([^\n]+)/i);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function extractCountry(text: string): string {
  const match = text.match(/Country[:\s]+([^\n]+)/i);
  return match ? match[1].trim() : "";
}

function buildRssUrl(query: string): string {
  const params = new URLSearchParams({ q: query, sort: "recency" });
  return `${RSS_BASE}?${params.toString()}`;
}

async function fetchForQuery(query: string): Promise<UpworkJob[]> {
  const url = buildRssUrl(query);
  try {
    const res = await fetch(url, { headers: FETCH_HEADERS });
    if (!res.ok) {
      console.error(`[scraper] HTTP ${res.status} for query "${query}"`);
      return [];
    }
    const xml = await res.text();
    const feed = await parser.parseString(xml);
    const jobs: UpworkJob[] = [];

    for (const item of feed.items) {
      const rawTitle = item.title ?? "Untitled";
      const rawDesc = item.summary ?? item.content ?? item.contentSnippet ?? "";
      const description = stripHtml(rawDesc);
      const jobUrl = item.link ?? "";

      // Local keyword filter — no API cost
      if (!isVoiceAiJob(rawTitle, description)) continue;

      const postedAt = item.pubDate ? new Date(item.pubDate) : new Date();

      jobs.push({
        jobId: extractJobId(jobUrl),
        title: rawTitle,
        url: jobUrl,
        description,
        budget: extractBudget(description),
        postedAt,
        skills: extractSkills(description),
        clientCountry: extractCountry(description),
      });
    }

    return jobs;
  } catch (err) {
    console.error(`[scraper] Failed to fetch query "${query}":`, err);
    return [];
  }
}

export async function scrapeJobs(): Promise<UpworkJob[]> {
  const results = await Promise.all(
    config.UPWORK_SEARCH_QUERIES.map(fetchForQuery)
  );

  // Flatten + deduplicate by jobId within this run
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

  console.log(`[scraper] ${unique.length} unique voice AI jobs after filtering`);
  return unique;
}
