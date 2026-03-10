import { neon } from "@neondatabase/serverless";
import { config } from "./config.js";
import type { UpworkJob } from "./models.js";

const sql = neon(config.DATABASE_URL);

export async function initDb(): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS jobs (
      job_id        TEXT PRIMARY KEY,
      title         TEXT NOT NULL,
      url           TEXT NOT NULL,
      description   TEXT,
      budget        TEXT,
      posted_at     TIMESTAMPTZ,
      skills        TEXT,
      client_country TEXT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  console.log("[store] Database ready");
}

export async function isNew(jobId: string): Promise<boolean> {
  const rows = await sql`
    SELECT 1 FROM jobs WHERE job_id = ${jobId} LIMIT 1
  `;
  return rows.length === 0;
}

export async function saveJob(job: UpworkJob): Promise<void> {
  await sql`
    INSERT INTO jobs (job_id, title, url, description, budget, posted_at, skills, client_country)
    VALUES (
      ${job.jobId},
      ${job.title},
      ${job.url},
      ${job.description},
      ${job.budget},
      ${job.postedAt.toISOString()},
      ${job.skills.join(",")},
      ${job.clientCountry}
    )
    ON CONFLICT (job_id) DO NOTHING
  `;
}

export async function getRecentJobs(limit: number = 20): Promise<unknown[]> {
  return sql`
    SELECT job_id, title, url, budget, skills, client_country, posted_at, created_at
    FROM jobs
    ORDER BY created_at DESC
    LIMIT ${limit}
  `;
}

export async function getJobById(jobId: string): Promise<UpworkJob | null> {
  const rows = await sql`
    SELECT * FROM jobs WHERE job_id = ${jobId} LIMIT 1
  `;
  if (rows.length === 0) return null;
  const row = rows[0];
  return {
    jobId: row.job_id as string,
    title: row.title as string,
    url: row.url as string,
    description: row.description as string,
    budget: row.budget as string,
    postedAt: new Date(row.posted_at as string),
    skills: row.skills ? (row.skills as string).split(",").filter(Boolean) : [],
    clientCountry: row.client_country as string,
  };
}
