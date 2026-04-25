import { decode } from "html-entities";

export type BoardType = "greenhouse" | "ashby" | "workable" | "linkedin";

/**
 * Strips all HTML tags and collapses whitespace for plain-text AI processing.
 */
function stripHtml(html: string): string {
    return html
        .replace(/<[^>]*>/g, " ")
        .replace(/&[a-z#0-9]+;/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

/**
 * Cleans basic text fields (title, company, location).
 */
function sanitizeText(value: string): string {
    return (value || "Unknown").trim().replace(/\s+/g, " ");
}

/**
 * Converts an ISO date string into a human-readable "X days ago" label.
 */
function formatTimeAgo(dateStr: string): string {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    
    const diffDays = Math.floor((Date.now() - date.getTime()) / 86_400_000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "1 day ago";
    return `${diffDays} days ago`;
}

/**
 * Normalizes a raw Greenhouse or Ashby job object into a consistent shape.
 *
 * Output contract:
 *  - `descriptionHtml`  → decoded HTML, safe for v-html in the frontend
 *  - `descriptionPlain` → plain text stripped of tags, used for AI prompts
 *  - `content`          → alias of descriptionHtml, kept for filterJobsWithAI compatibility
 */
export function normalizeJob(rawJob: any, boardType: BoardType) {
    let rawHtml: string = "";
    let position: string = "";
    let company: string = "";
    let location: string = "";
    let date: string = "";
    let jobUrl: string = "";

    if (boardType === "greenhouse") {
        // Greenhouse stores the HTML body in `content`
        rawHtml   = rawJob.content || rawJob.description || rawJob.job_description || "";
        position  = sanitizeText(rawJob.title);
        company   = sanitizeText(rawJob.company_name || rawJob.boardId);
        location  = sanitizeText(rawJob.location?.name || rawJob.offices?.[0]?.name);
        date      = rawJob.updated_at || "";
        jobUrl    = rawJob.absolute_url || "";
    } else if (boardType === "ashby") {
        // Ashby stores the HTML body in `descriptionHtml`
        rawHtml   = rawJob.descriptionHtml || rawJob.description || rawJob.jobDescription || "";
        position  = sanitizeText(rawJob.title);
        company   = sanitizeText(rawJob.team);
        location  = sanitizeText(rawJob.locationName || rawJob.location);
        date      = rawJob.publishedAt || "";
        jobUrl    = rawJob.jobUrl || "";
    } else if (boardType === "workable") {
        // Workable stores the HTML body in `description`
        rawHtml   = rawJob.description || "";
        position  = sanitizeText(rawJob.title);
        // Workable often passes the company name in the rawJob if we map it correctly in the route
        company   = sanitizeText(rawJob.company || rawJob.accountName);
        
        // Location mapping
        const city = rawJob.city || "";
        const country = rawJob.country || "";
        location  = sanitizeText(city && country ? `${city}, ${country}` : (city || country || "Remote"));
        
        date      = rawJob.published_on || rawJob.created_at || "";
        jobUrl    = rawJob.url || rawJob.shortlink || "";
    }

    const descriptionHtml  = rawHtml ? decode(rawHtml) : "";
    const descriptionPlain = stripHtml(descriptionHtml);

    return {
        id: rawJob.id,
        position,
        company,
        location,
        date,
        agoTime: formatTimeAgo(date),
        jobUrl,
        boardType,
        descriptionHtml,
        descriptionPlain,
        content: descriptionHtml, // ← filterJobsWithAI still reads .content internally
    };
}
