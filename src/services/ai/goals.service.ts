import { QueryOptions } from "../../types";
import { SearchGoal } from "./types";
import { callAiWithJsonRetry, DEFAULT_AI_MODEL, DEFAULT_BASE_URL } from "./core.service";

const _goalValidator = (p: SearchGoal): string | null => {
  if (!p.summary || p.summary.trim().length < 10) return '"summary" is too short';
  if (!Array.isArray(p.titles) || p.titles.length === 0) return '"titles" must be a non-empty array';
  if (!Array.isArray(p.relatedTitles)) return '"relatedTitles" must be an array';
  if (p.titles.length > 6) return '"titles" must have 6 or fewer items';
  if (p.relatedTitles.length < 5) return '"relatedTitles" must have at least 5 items';
  return null;
};

export async function generateJobDescription(
  queryOptions: QueryOptions,
  model: string = DEFAULT_AI_MODEL,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<SearchGoal> {
  const fallbackGoal: SearchGoal = {
    summary: `Searching for ${queryOptions.keyword}${queryOptions.location ? ` in ${queryOptions.location}` : ""}.`,
    titles: [queryOptions.keyword],
    relatedTitles: [],
  };

  try {
    const payload = {
      messages: [
        {
          role: "system",
          content: `You are a professional job search strategist. Translate the user's filters into a structured search goal.

Output ONLY this JSON object — no markdown, no code fences, no text outside the braces:
{
  "summary": "2-3 sentence description of the user's search intent.",
  "titles": ["Primary Role", "Variant Role"],
  "relatedTitles": ["Related 1", "Related 2", "Related 3", "Related 4", "Related 5", "Related 6", "Related 7", "Related 8"]
}

Rules:
- "titles" must be a flat JSON array of 2-5 plain strings — the direct job titles the user wants.
- "relatedTitles" must be a flat JSON array of 5-10 plain strings — adjacent roles, NOT duplicates of "titles".
- "summary" must mention the keyword, location, and any active filters. If a filter is "Any" or missing, say "open to all".
- Do not use single quotes, asterisks, bold, markdown, or nested objects anywhere.`,
        },
        {
          role: "user",
          content: `Translate these filters into a structured search goal:
- Keywords: ${queryOptions.keyword}
- Location: ${queryOptions.location || "Global"}
- Target Country: ${queryOptions.targetCountry || "Any"}
- Job Type: ${queryOptions.jobType || "Any"}
- Remote: ${queryOptions.remoteFilter || "Any"}
- Salary: ${queryOptions.salary || "Not specified"}
- Experience: ${queryOptions.experienceLevel || "Any"}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 500,
    };

    const parsed = await callAiWithJsonRetry<SearchGoal>(model, baseUrl, payload, "SearchGoal JSON object", false, _goalValidator);

    if (parsed) return parsed;
  } catch (error) {
    console.warn("Unexpected error in generateJobDescription:", error);
  }
  return fallbackGoal;
}

export async function generateCompanyJobGoal(
  keyword: string,
  platform: string = "Greenhouse",
  targetCountry: string = "Any",
  model: string = DEFAULT_AI_MODEL,
  baseUrl: string = DEFAULT_BASE_URL,
): Promise<SearchGoal> {
  const fallbackGoal: SearchGoal = {
    summary: `Searching for ${keyword} on ${platform}.`,
    titles: [keyword],
    relatedTitles: [],
  };

  try {
    const payload = {
      messages: [
        {
          role: "system",
          content: `You are a recruiter specializing in company-specific ${platform} job boards. Translate the keyword into a structured search goal for a single company's openings.

Output ONLY this JSON object — no markdown, no code fences, no text outside the braces:
{
  "summary": "2-3 sentence description mentioning the keyword and the ${platform} board context.",
  "titles": ["Primary Role", "Variant Role"],
  "relatedTitles": ["Related 1", "Related 2", "Related 3", "Related 4", "Related 5", "Related 6", "Related 7", "Related 8"]
}

Rules:
- "titles" must be a flat JSON array of 2-5 plain strings.
- "relatedTitles" must be a flat JSON array of 5-10 plain strings — must NOT duplicate items in "titles".
- Do not use single quotes, asterisks, bold, or markdown anywhere.`,
        },
        {
          role: "user",
          content: `Generate a search goal for this ${platform} board search:
- Target Keywords: ${keyword}
- Target Country: ${targetCountry}`,
        },
      ],
      temperature: 0.1,
      max_tokens: 500,
    };

    const parsed = await callAiWithJsonRetry<SearchGoal>(model, baseUrl, payload, `${platform} SearchGoal JSON`, false, _goalValidator);

    if (parsed) return parsed;
  } catch (error) {
    console.warn(`Unexpected error in generateCompanyJobGoal (${platform}):`, error);
  }
  return fallbackGoal;
}
