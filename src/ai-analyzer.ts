import Groq from "groq-sdk";
import { config } from "./config.js";
import type { UpworkJob } from "./models.js";

const groq = new Groq({ apiKey: config.GROQ_API_KEY });

const SYSTEM_PROMPT = `You are a senior Voice AI engineer writing a compelling Upwork cover letter.

Freelancer profile:
- Name: ${config.FREELANCER_NAME}
- Experience: ${config.FREELANCER_EXPERIENCE_YEARS} years
- Skills: ${config.FREELANCER_SKILLS}
- Bio: ${config.FREELANCER_BIO}

Rules for the cover letter:
1. Open with a specific hook showing you read the job post
2. Address the client's pain point in 1-2 sentences
3. Briefly mention 1-2 relevant past results tied to voice AI (building agents, fixing pipelines, reducing latency, etc.)
4. End with a clear call to action for a discovery call
5. Keep it under 180 words — short proposals win on Upwork
6. Do NOT start with "I am writing to apply" or generic openers
7. Write in first person, conversational but professional tone
8. Do NOT use bullet points`;

export async function draftProposal(job: UpworkJob): Promise<string> {
  const userMessage = `Job Title: ${job.title}

Description:
${job.description.slice(0, 2500)}

Budget: ${job.budget || "Not specified"}`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      temperature: 0.7,
      max_tokens: 400,
    });

    return completion.choices[0]?.message?.content?.trim() ?? "Could not generate proposal.";
  } catch (err) {
    console.error("[ai-analyzer] Groq call failed:", err);
    return "⚠️ Failed to generate proposal. Please try again.";
  }
}
