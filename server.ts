// server.ts
import express, { Request, Response } from "express";
import path from "path";
import linkedIn from "linkedin-jobs-api";
import open from "open";

// Import modules
import { Job } from "./src/types";
import { escapeHtml } from "./src/utils";
import { getEffectiveQueryOptions } from "./src/args";
import { filterJobsWithAI } from "./src/services/aiService";
import { PORT } from "./src/config";

const app = express();

// Global variables to cache job data and error message after initial fetch
let cachedJobs: Job[] = [];
let aiFilteredJobs: Job[] = [];
let cachedErrorMessage: string = "";
let aiErrorMessage: string = "";
let isInitialFetchComplete: boolean = false;

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Route to fetch and display jobs
app.get("/", (req: Request, res: Response) => {
  const queryOptionsForForm = getEffectiveQueryOptions();

  res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>LinkedIn Job Search (Modular)</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
            <style>
                body { font-family: 'Inter', sans-serif; background-color: #f3f4f6; color: #333; }
                .container { max-width: 1200px; margin: 2rem auto; padding: 1.5rem; background-color: #ffffff; border-radius: 0.75rem; box-shadow: 0 4px 6px rgba(0,0,0,0.1); }
                .form-input { padding: 0.6rem 1rem; border: 1px solid #d1d5db; border-radius: 0.5rem; width: 100%; box-sizing: border-box; transition: border-color 0.2s; }
                .form-input:focus { outline: none; border-color: #6366f1; }
                .btn { padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 600; cursor: pointer; transition: all 0.2s; }
                .btn-primary { background-color: #6366f1; color: #ffffff; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
                .btn-primary:hover { background-color: #4f46e5; transform: translateY(-1px); }
                .btn-secondary { background-color: #e5e7eb; color: #374151; box-shadow: 0 2px 4px rgba(0,0,0,0.05); }
                .btn-secondary:hover { background-color: #d1d5db; transform: translateY(-1px); }
                table { width: 100%; border-collapse: collapse; margin-top: 1.5rem; }
                th, td { text-align: left; padding: 0.8rem 1rem; border-bottom: 1px solid #e5e7eb; }
                th { background-color: #f9fafb; font-weight: 600; color: #4b5563; position: sticky; top: 0; z-index: 10; }
                tbody tr:hover { background-color: #f3f4f6; }
                .job-link { color: #6366f1; text-decoration: none; }
                .job-link:hover { text-decoration: underline; }
                .filter-section { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem; }
            </style>
        </head>
        <body>
            <div class="container">
                <h1 class="text-3xl font-bold text-center text-indigo-700 mb-6">LinkedIn Job Search (Modular)</h1>

                <form id="filterForm" class="mb-8 p-6 bg-gray-50 rounded-lg shadow-sm">
                    <div class="filter-section mb-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Keywords:</label>
                            <input type="text" name="keyword" class="form-input" value="${escapeHtml(queryOptionsForForm.keyword)}">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Location:</label>
                            <input type="text" name="location" class="form-input" value="${escapeHtml(queryOptionsForForm.location)}">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Date Posted:</label>
                            <select name="dateSincePosted" class="form-input">
                                <option value="past Week" ${queryOptionsForForm.dateSincePosted === "past Week" ? "selected" : ""}>Past Week</option>
                                <option value="24hr" ${queryOptionsForForm.dateSincePosted === "24hr" ? "selected" : ""}>Past 24 Hours</option>
                                <option value="past Month" ${queryOptionsForForm.dateSincePosted === "past Month" ? "selected" : ""}>Past Month</option>
                                <option value="" ${queryOptionsForForm.dateSincePosted === "" ? "selected" : ""}>Anytime</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Limit:</label>
                            <input type="number" name="limit" class="form-input" value="${escapeHtml(queryOptionsForForm.limit)}">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Job Type:</label>
                            <select name="jobType" class="form-input">
                                <option value="" ${queryOptionsForForm.jobType === "" ? "selected" : ""}>Any</option>
                                <option value="full time" ${queryOptionsForForm.jobType === "full time" ? "selected" : ""}>Full-time</option>
                                <option value="part time" ${queryOptionsForForm.jobType === "part time" ? "selected" : ""}>Part-time</option>
                                <option value="contract" ${queryOptionsForForm.jobType === "contract" ? "selected" : ""}>Contract</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Remote:</label>
                            <select name="remoteFilter" class="form-input">
                                <option value="" ${queryOptionsForForm.remoteFilter === "" ? "selected" : ""}>Any</option>
                                <option value="remote" ${queryOptionsForForm.remoteFilter === "remote" ? "selected" : ""}>Remote</option>
                                <option value="on site" ${queryOptionsForForm.remoteFilter === "on site" ? "selected" : ""}>On-site</option>
                            </select>
                        </div>
                    </div>
                    <div class="flex justify-end gap-3 mt-4">
                        <button type="submit" class="btn btn-primary">Apply Filters</button>
                        <button type="button" id="exportCsvBtn" class="btn btn-secondary">Export to CSV</button>
                    </div>
                </form>

                ${cachedErrorMessage ? `<div class="bg-red-100 p-4 rounded-md mb-6 text-red-700"><strong>Error:</strong> ${cachedErrorMessage}</div>` : ""}
                ${aiErrorMessage ? `<div class="bg-orange-100 p-4 rounded-md mb-6 text-orange-700"><strong>AI Warning:</strong> ${aiErrorMessage}</div>` : ""}

                ${aiFilteredJobs.length > 0 ? `
                <div class="mb-8 p-4 bg-indigo-50/50 rounded-xl border border-indigo-100">
                    <h2 class="text-2xl font-bold text-indigo-700 mb-4">✨ AI Top Picks</h2>
                    <div class="overflow-x-auto">
                        <table class="min-w-full bg-white rounded-lg">
                            <thead>
                                <tr class="bg-indigo-100 text-indigo-800">
                                    <th class="p-3">Position</th><th class="p-3">Company</th><th class="p-3">Location</th><th class="p-3">Link</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${aiFilteredJobs.map(job => `
                                    <tr class="border-b border-indigo-100 hover:bg-indigo-50">
                                        <td class="p-3 font-medium">${escapeHtml(job.position || "N/A")}</td>
                                        <td class="p-3">${escapeHtml(job.company || "N/A")}</td>
                                        <td class="p-3">${escapeHtml(job.location || "N/A")}</td>
                                        <td class="p-3"><a href="${escapeHtml(job.jobUrl || "#")}" target="_blank" class="job-link font-semibold">View Job ✨</a></td>
                                    </tr>
                                `).join("")}
                            </tbody>
                        </table>
                    </div>
                </div>` : ""}

                <h2 class="text-xl font-semibold text-gray-700 mb-4">All Jobs</h2>
                <div class="overflow-x-auto rounded-lg shadow-md">
                    <table id="jobTable" class="min-w-full bg-white rounded-lg">
                        <thead>
                            <tr><th>Position</th><th>Company</th><th>Location</th><th>Link</th></tr>
                        </thead>
                        <tbody>
                            ${cachedJobs.map(job => `
                                <tr>
                                    <td>${escapeHtml(job.position || "N/A")}</td>
                                    <td>${escapeHtml(job.company || "N/A")}</td>
                                    <td>${escapeHtml(job.location || "N/A")}</td>
                                    <td><a href="${escapeHtml(job.jobUrl || "#")}" target="_blank" class="job-link">View Job</a></td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </div>

            <script>
                document.getElementById('filterForm').addEventListener('submit', (e) => {
                    e.preventDefault();
                    alert('To change parameters, restart the server with new arguments.');
                });
                document.getElementById('exportCsvBtn').addEventListener('click', () => {
                    const table = document.getElementById('jobTable');
                    let csv = ["Position,Company,Location,Link"];
                    table.querySelectorAll('tbody tr').forEach(row => {
                        const cols = row.querySelectorAll('td');
                        const data = [cols[0].innerText, cols[1].innerText, cols[2].innerText, cols[3].querySelector('a').href];
                        csv.push(data.map(t => \`"\${t.replace(/"/g, '""')}"\`).join(','));
                    });
                    const blob = new Blob([csv.join('\\n')], { type: 'text/csv' });
                    const link = document.createElement('a');
                    link.download = 'jobs.csv';
                    link.href = window.URL.createObjectURL(blob);
                    link.click();
                });
            </script>
        </body>
        </html>
    `);
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);

  const queryOptions = getEffectiveQueryOptions();
  console.log("Performing initial job search...");

  (linkedIn as any)
    .query(queryOptions)
    .then(async (response: Job[] | unknown) => {
      if (Array.isArray(response)) {
        cachedJobs = response;
        console.log(`Initial fetch completed. Fetched ${cachedJobs.length} jobs.`);
        
        const aiResult = await filterJobsWithAI(cachedJobs, queryOptions);
        aiFilteredJobs = aiResult.filteredJobs;
        aiErrorMessage = aiResult.errorMessage;
        
        console.log(`AI Filtering complete. Found ${aiFilteredJobs.length} top picks.`);
      } else {
        cachedErrorMessage = "No jobs found or unexpected API response format.";
      }
    })
    .catch((error: any) => {
      console.error("Initial fetch error:", error);
      cachedErrorMessage = `Failed to fetch jobs: ${error.message}`;
    })
    .finally(() => {
      isInitialFetchComplete = true;
      open(`http://localhost:${PORT}`).catch(err => console.error("Failed to open browser:", err));
    });
});
