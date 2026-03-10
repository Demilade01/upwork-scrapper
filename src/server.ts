import Fastify from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { getJobById, getRecentJobs, isNew, saveJob } from "./store.js";
import { draftProposal } from "./ai-analyzer.js";
import { scrapeJobs } from "./scraper.js";
import { sendJobAlert } from "./telegram.js";

export async function buildServer() {
  const app = Fastify({ logger: false });

  // ── Swagger spec ────────────────────────────────────────────────────────────
  await app.register(swagger, {
    openapi: {
      info: {
        title: "Upwork Voice AI Bot API",
        description:
          "Admin & monitoring API for the Upwork Voice AI job scraper bot. " +
          "Browse recent jobs, trigger manual scrapes, and generate proposals.",
        version: "1.0.0",
      },
      tags: [
        { name: "Health", description: "Service health" },
        { name: "Jobs", description: "Job listings from the database" },
        { name: "Actions", description: "Trigger bot actions manually" },
      ],
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: { docExpansion: "list", deepLinking: true },
    staticCSP: true,
  });

  // ── Routes ──────────────────────────────────────────────────────────────────

  // GET /health
  app.get(
    "/health",
    {
      schema: {
        tags: ["Health"],
        summary: "Health check",
        response: {
          200: {
            type: "object",
            properties: {
              status: { type: "string" },
              uptime: { type: "number" },
              timestamp: { type: "string" },
            },
          },
        },
      },
    },
    async () => ({
      status: "ok",
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    })
  );

  // GET /jobs
  app.get(
    "/jobs",
    {
      schema: {
        tags: ["Jobs"],
        summary: "List recent jobs",
        description: "Returns the 20 most recently stored jobs from Neon Postgres.",
        querystring: {
          type: "object",
          properties: {
            limit: { type: "integer", minimum: 1, maximum: 100, default: 20 },
          },
        },
        response: {
          200: {
            type: "array",
            items: {
              type: "object",
              properties: {
                job_id: { type: "string" },
                title: { type: "string" },
                url: { type: "string" },
                budget: { type: "string" },
                skills: { type: "string" },
                client_country: { type: "string" },
                posted_at: { type: "string" },
                created_at: { type: "string" },
              },
            },
          },
        },
      },
    },
    async (req) => {
      const { limit = 20 } = req.query as { limit?: number };
      return getRecentJobs(limit);
    }
  );

  // GET /jobs/:id
  app.get(
    "/jobs/:id",
    {
      schema: {
        tags: ["Jobs"],
        summary: "Get a single job by ID",
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              jobId: { type: "string" },
              title: { type: "string" },
              url: { type: "string" },
              description: { type: "string" },
              budget: { type: "string" },
              skills: { type: "array", items: { type: "string" } },
              clientCountry: { type: "string" },
              postedAt: { type: "string" },
            },
          },
          404: {
            type: "object",
            properties: { error: { type: "string" } },
          },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const job = await getJobById(id);
      if (!job) {
        reply.code(404);
        return { error: "Job not found" };
      }
      return { ...job, postedAt: job.postedAt.toISOString() };
    }
  );

  // POST /jobs/:id/proposal
  app.post(
    "/jobs/:id/proposal",
    {
      schema: {
        tags: ["Actions"],
        summary: "Generate a draft proposal for a job",
        description:
          "Makes a single Groq API call to draft a personalised cover letter. " +
          "Same action as pressing the Telegram button.",
        params: {
          type: "object",
          properties: { id: { type: "string" } },
          required: ["id"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              jobId: { type: "string" },
              proposal: { type: "string" },
            },
          },
          404: {
            type: "object",
            properties: { error: { type: "string" } },
          },
        },
      },
    },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      const job = await getJobById(id);
      if (!job) {
        reply.code(404);
        return { error: "Job not found" };
      }
      const proposal = await draftProposal(job);
      return { jobId: id, proposal };
    }
  );

  // POST /scrape
  app.post(
    "/scrape",
    {
      schema: {
        tags: ["Actions"],
        summary: "Manually trigger a scrape",
        description:
          "Runs the full pipeline immediately: scrape → dedup → send Telegram alerts → save.",
        response: {
          200: {
            type: "object",
            properties: {
              newJobs: { type: "integer" },
              message: { type: "string" },
            },
          },
        },
      },
    },
    async () => {
      const jobs = await scrapeJobs();
      let newCount = 0;
      for (const job of jobs) {
        if (!(await isNew(job.jobId))) continue;
        await saveJob(job);
        await sendJobAlert(job);
        newCount++;
        await new Promise((r) => setTimeout(r, 1000));
      }
      return {
        newJobs: newCount,
        message: `Pipeline complete — ${newCount} new job(s) sent to Telegram`,
      };
    }
  );

  return app;
}

export async function startServer(port: number): Promise<void> {
  const app = await buildServer();
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`🌐 Swagger UI → http://localhost:${port}/docs`);
}
