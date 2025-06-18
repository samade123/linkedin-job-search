// server.ts
import express, { Request, Response } from 'express';
import path from 'path';
import linkedIn from 'linkedin-jobs-api'; // Import the LinkedIn Jobs API
import open from 'open'; // Import the 'open' package to open the browser

const app = express();
const PORT = process.env.PORT || 3000;

// Global variables to cache job data and error message after initial fetch
let cachedJobs: Job[] = [];
let cachedErrorMessage: string = '';
let isInitialFetchComplete: boolean = false; // Flag to ensure browser opens only once after initial fetch

// Define an interface for the job object structure based on actual API response
interface Job {
    position: string;
    company: string;
    companyLogo?: string; // Optional as it might not always be present
    location: string;
    date: string;
    agoTime: string;
    salary?: string; // Optional
    jobUrl: string;
}

// Define an interface for query options to ensure type safety
interface QueryOptions {
    keyword: string;
    location: string;
    dateSincePosted: '24hr' | 'past Week' | 'past Month' | '';
    limit: string;
    jobType: 'full time' | 'part time' | 'contract' | 'temporary' | 'volunteer' | 'internship' | '';
    remoteFilter: 'on site' | 'remote' | 'hybrid' | '';
    salary: '40000' | '60000' | '80000' | '100000' | '120000' | '';
    experienceLevel: 'internship' | 'entry level' | 'associate' | 'senior' | 'director' | 'executive' | '';
    sortBy: 'recent' | 'relevant';
}

// Serve static files (if any, though in this case HTML is generated)
app.use(express.static(path.join(__dirname, 'public')));

// Helper function to escape HTML for safe display
function escapeHtml(unsafe: string): string {
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Function to display help message and exit
function showHelpAndExit() {
    console.log(`
Usage: npm start [--keyword="<keywords>"] [--location="<location>"] [--dateSincePosted="<timeframe>"] [--limit="<number>"] [--jobType="<type>"] [--remoteFilter="<filter>"] [--salary="<salary_range>"] [--experienceLevel="<level>"] [--sortBy="<sort_order>"]

Note: Job search is performed once when the server starts based on these parameters.
      The browser will open automatically after the initial search.

Options:
  --keyword          : Search terms (e.g., "React, Node.js"). Default: "Vue.js, Angular"
  --location         : Job location (e.g., "London", "Remote"). Default: "" (global)
  --dateSincePosted  : Filter by post date. Valid values: "24hr", "past Week", "past Month", "". Default: "past Week"
  --limit            : Number of jobs returned. (e.g., "10", "100"). Default: "100"
  --jobType          : Type of position. Valid values: "full time", "part time", "contract", "temporary", "volunteer", "internship", "". Default: ""
  --remoteFilter     : Filter telecommuting. Valid values: "on site", "remote", "hybrid", "". Default: ""
  --salary           : Minimum salary. Valid values: "40000", "60000", "80000", "100000", "120000", "". Default: ""
  --experienceLevel  : Required experience. Valid values: "internship", "entry level", "associate", "senior", "director", "executive", "". Default: ""
  --sortBy           : Result ordering. Valid values: "recent", "relevant". Default: "recent"
  --help             : Show this help message and exit.

Example:
  npm start -- --keyword="TypeScript" --location="Remote" --dateSincePosted="24hr" --limit="50"
    `);
    process.exit(0); // Exit the process
}


// Function to parse command-line arguments
function parseCommandLineArgs(): Partial<QueryOptions> {
    const args: Partial<QueryOptions> = {};
    // process.argv[0] is 'node', process.argv[1] is 'server.js' (or 'dist/server.js')
    // We start parsing from index 2
    for (let i = 2; i < process.argv.length; i++) {
        const arg = process.argv[i];
        if (arg === '--help' || arg ==='-h') {
            showHelpAndExit();
        }
        if (arg.startsWith('--')) {
            const [key, value] = arg.substring(2).split('=');
            if (key && value !== undefined) { // Check for undefined to allow empty string values
                // Type casting for known keys to match QueryOptions
                switch (key) {
                    case 'keyword':
                    case 'location':
                    case 'limit':
                        args[key] = value;
                        break;
                    case 'dateSincePosted':
                        const validDateSincePosted = ['24hr', 'past Week', 'past Month', ''];
                        if (validDateSincePosted.includes(value)) {
                            args[key] = value as QueryOptions['dateSincePosted'];
                        } else {
                            console.warn(`Invalid value for --${key}: "${value}". Must be one of ${validDateSincePosted.map(v => `"${v}"`).join(', ')}. Ignoring.`);
                        }
                        break;
                    case 'jobType':
                        const validJobTypes = ['full time', 'part time', 'contract', 'temporary', 'volunteer', 'internship', ''];
                        if (validJobTypes.includes(value)) {
                            args[key] = value as QueryOptions['jobType'];
                        } else {
                            console.warn(`Invalid value for --${key}: "${value}". Must be one of ${validJobTypes.map(v => `"${v}"`).join(', ')}. Ignoring.`);
                        }
                        break;
                    case 'remoteFilter':
                        const validRemoteFilters = ['on site', 'remote', 'hybrid', ''];
                        if (validRemoteFilters.includes(value)) {
                            args[key] = value as QueryOptions['remoteFilter'];
                        } else {
                            console.warn(`Invalid value for --${key}: "${value}". Must be one of ${validRemoteFilters.map(v => `"${v}"`).join(', ')}. Ignoring.`);
                        }
                        break;
                    case 'salary':
                        const validSalaries = ['40000', '60000', '80000', '100000', '120000', ''];
                        if (validSalaries.includes(value)) {
                            args[key] = value as QueryOptions['salary'];
                        } else {
                            console.warn(`Invalid value for --${key}: "${value}". Must be one of ${validSalaries.map(v => `"${v}"`).join(', ')}. Ignoring.`);
                        }
                        break;
                    case 'experienceLevel':
                        const validExperienceLevels = ['internship', 'entry level', 'associate', 'senior', 'director', 'executive', ''];
                        if (validExperienceLevels.includes(value)) {
                            args[key] = value as QueryOptions['experienceLevel'];
                        } else {
                            console.warn(`Invalid value for --${key}: "${value}". Must be one of ${validExperienceLevels.map(v => `"${v}"`).join(', ')}. Ignoring.`);
                        }
                        break;
                    case 'sortBy':
                        const validSortBys = ['recent', 'relevant'];
                        if (validSortBys.includes(value)) {
                            args[key] = value as QueryOptions['sortBy'];
                        } else {
                            console.warn(`Invalid value for --${key}: "${value}". Must be one of ${validSortBys.map(v => `"${v}"`).join(', ')}. Ignoring.`);
                        }
                        break;
                    default:
                        console.warn(`Unknown command-line argument: --${key}. Ignoring.`);
                        break;
                }
            } else {
                console.warn(`Invalid command-line argument format: "${arg}". Expected --key=value. Ignoring.`);
            }
        } else {
            console.warn(`Unrecognized command-line argument: "${arg}". Expected arguments to start with '--'. Ignoring.`);
        }
    }
    return args;
}

// Function to get the effective query options by merging defaults with command-line arguments.
function getEffectiveQueryOptions(): QueryOptions {
    const hardcodedDefaultOptions: QueryOptions = {
        keyword: 'Vue.js, Angular',
        location: 'london', // Empty string for global search
        dateSincePosted: 'past Week',
        limit: '100',
        jobType: '',
        remoteFilter: '',
        salary: '',
        experienceLevel: '',
        sortBy: 'recent'
    };

    const cmdLineArgs = parseCommandLineArgs();

    // Merge hardcoded defaults with command-line arguments.
    // Properties from cmdLineArgs will override those in hardcodedDefaultOptions.
    // If cmdLineArgs is empty, hardcodedDefaultOptions will be used entirely.
    return { ...hardcodedDefaultOptions, ...cmdLineArgs };
}

// Route to fetch and display jobs
app.get('/', (req: Request, res: Response) => {
    // Render the page using the cached data.
    // The queryOptions for the form are derived from the *cached* data's parameters,
    // which were set at server startup.
    const queryOptionsForForm = getEffectiveQueryOptions(); // Re-use the logic to populate form fields

    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>LinkedIn Job Search (TypeScript)</title>
            <script src="https://cdn.tailwindcss.com"></script>
            <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
            <style>
                body {
                    font-family: 'Inter', sans-serif;
                    background-color: #f3f4f6;
                    color: #333;
                }
                .container {
                    max-width: 1200px;
                    margin: 2rem auto;
                    padding: 1.5rem;
                    background-color: #ffffff;
                    border-radius: 0.75rem;
                    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
                }
                .form-input {
                    padding: 0.6rem 1rem;
                    border: 1px solid #d1d5db;
                    border-radius: 0.5rem;
                    width: 100%;
                    box-sizing: border-box;
                    transition: border-color 0.2s;
                }
                .form-input:focus {
                    outline: none;
                    border-color: #6366f1; /* Indigo-500 */
                }
                .btn {
                    padding: 0.75rem 1.5rem;
                    border-radius: 0.5rem;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background-color 0.2s, transform 0.1s;
                }
                .btn-primary {
                    background-color: #6366f1; /* Indigo-500 */
                    color: #ffffff;
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
                }
                .btn-primary:hover {
                    background-color: #4f46e5; /* Indigo-600 */
                    transform: translateY(-1px);
                }
                .btn-secondary {
                    background-color: #e5e7eb; /* Gray-200 */
                    color: #374151; /* Gray-700 */
                    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
                }
                .btn-secondary:hover {
                    background-color: #d1d5db; /* Gray-300 */
                    transform: translateY(-1px);
                }
                table {
                    width: 100%;
                    border-collapse: collapse;
                    margin-top: 1.5rem;
                }
                th, td {
                    text-align: left;
                    padding: 0.8rem 1rem;
                    border-bottom: 1px solid #e5e7eb; /* Gray-200 */
                }
                th {
                    background-color: #f9fafb; /* Gray-50 */
                    font-weight: 600;
                    color: #4b5563; /* Gray-600 */
                    position: sticky;
                    top: 0;
                    z-index: 10;
                }
                tbody tr:hover {
                    background-color: #f3f4f6; /* Gray-100 */
                }
                .job-link {
                    color: #6366f1;
                    text-decoration: none;
                }
                .job-link:hover {
                    text-decoration: underline;
                }
                .filter-section {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                    gap: 1rem;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1 class="text-3xl font-bold text-center text-indigo-700 mb-6 rounded-md p-2">LinkedIn Job Search (TypeScript)</h1>

                <form id="filterForm" class="mb-8 p-6 bg-gray-50 rounded-lg shadow-sm">
                    <div class="filter-section mb-4">
                        <div>
                            <label for="keyword" class="block text-sm font-medium text-gray-700 mb-1">Keywords (comma-separated):</label>
                            <input type="text" id="keyword" name="keyword" class="form-input" value="${escapeHtml(queryOptionsForForm.keyword)}">
                        </div>
                        <div>
                            <label for="location" class="block text-sm font-medium text-gray-700 mb-1">Location:</label>
                            <input type="text" id="location" name="location" class="form-input" value="${escapeHtml(queryOptionsForForm.location)}">
                        </div>
                        <div>
                            <label for="dateSincePosted" class="block text-sm font-medium text-gray-700 mb-1">Date Posted:</label>
                            <select id="dateSincePosted" name="dateSincePosted" class="form-input">
                                <option value="past Week" ${queryOptionsForForm.dateSincePosted === 'past Week' ? 'selected' : ''}>Past Week</option>
                                <option value="24hr" ${queryOptionsForForm.dateSincePosted === '24hr' ? 'selected' : ''}>Past 24 Hours</option>
                                <option value="past Month" ${queryOptionsForForm.dateSincePosted === 'past Month' ? 'selected' : ''}>Past Month</option>
                                <option value="" ${queryOptionsForForm.dateSincePosted === '' ? 'selected' : ''}>Anytime</option>
                            </select>
                        </div>
                        <div>
                            <label for="limit" class="block text-sm font-medium text-gray-700 mb-1">Limit:</label>
                            <input type="number" id="limit" name="limit" class="form-input" value="${escapeHtml(queryOptionsForForm.limit)}" min="1" max="1000">
                        </div>
                        <div>
                            <label for="jobType" class="block text-sm font-medium text-gray-700 mb-1">Job Type:</label>
                            <select id="jobType" name="jobType" class="form-input">
                                <option value="" ${queryOptionsForForm.jobType === '' ? 'selected' : ''}>Any</option>
                                <option value="full time" ${queryOptionsForForm.jobType === 'full time' ? 'selected' : ''}>Full-time</option>
                                <option value="part time" ${queryOptionsForForm.jobType === 'part time' ? 'selected' : ''}>Part-time</option>
                                <option value="contract" ${queryOptionsForForm.jobType === 'contract' ? 'selected' : ''}>Contract</option>
                                <option value="temporary" ${queryOptionsForForm.jobType === 'temporary' ? 'selected' : ''}>Temporary</option>
                                <option value="volunteer" ${queryOptionsForForm.jobType === 'volunteer' ? 'selected' : ''}>Volunteer</option>
                                <option value="internship" ${queryOptionsForForm.jobType === 'internship' ? 'selected' : ''}>Internship</option>
                            </select>
                        </div>
                        <div>
                            <label for="remoteFilter" class="block text-sm font-medium text-gray-700 mb-1">Remote:</label>
                            <select id="remoteFilter" name="remoteFilter" class="form-input">
                                <option value="" ${queryOptionsForForm.remoteFilter === '' ? 'selected' : ''}>Any</option>
                                <option value="remote" ${queryOptionsForForm.remoteFilter === 'remote' ? 'selected' : ''}>Remote</option>
                                <option value="on site" ${queryOptionsForForm.remoteFilter === 'on site' ? 'selected' : ''}>On-site</option>
                                <option value="hybrid" ${queryOptionsForForm.remoteFilter === 'hybrid' ? 'selected' : ''}>Hybrid</option>
                            </select>
                        </div>
                        <div>
                            <label for="experienceLevel" class="block text-sm font-medium text-gray-700 mb-1">Experience Level:</label>
                            <select id="experienceLevel" name="experienceLevel" class="form-input">
                                <option value="" ${queryOptionsForForm.experienceLevel === '' ? 'selected' : ''}>Any</option>
                                <option value="internship" ${queryOptionsForForm.experienceLevel === 'internship' ? 'selected' : ''}>Internship</option>
                                <option value="entry level" ${queryOptionsForForm.experienceLevel === 'entry level' ? 'selected' : ''}>Entry Level</option>
                                <option value="associate" ${queryOptionsForForm.experienceLevel === 'associate' ? 'selected' : ''}>Associate</option>
                                <option value="senior" ${queryOptionsForForm.experienceLevel === 'senior' ? 'selected' : ''}>Senior</option>
                                <option value="director" ${queryOptionsForForm.experienceLevel === 'director' ? 'selected' : ''}>Director</option>
                                <option value="executive" ${queryOptionsForForm.experienceLevel === 'executive' ? 'selected' : ''}>Executive</option>
                            </select>
                        </div>
                        <div>
                            <label for="sortBy" class="block text-sm font-medium text-gray-700 mb-1">Sort By:</label>
                            <select id="sortBy" name="sortBy" class="form-input">
                                <option value="recent" ${queryOptionsForForm.sortBy === 'recent' ? 'selected' : ''}>Recent</option>
                                <option value="relevant" ${queryOptionsForForm.sortBy === 'relevant' ? 'selected' : ''}>Relevant</option>
                            </select>
                        </div>
                            </div>
                            <div class="flex justify-end gap-3 mt-4">
                                <button type="submit" class="btn btn-primary">Apply Filters</button>
                                <button type="button" id="exportCsvBtn" class="btn btn-secondary">Export to CSV</button>
                            </div>
                        </form>

                        ${cachedErrorMessage ? `<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md relative mb-6" role="alert">
                            <strong class="font-bold">Error!</strong>
                            <span class="block sm:inline">${cachedErrorMessage}</span>
                        </div>` : ''}

                        <div class="overflow-x-auto rounded-lg shadow-md">
                            <table id="jobTable" class="min-w-full bg-white rounded-lg">
                                <thead>
                                    <tr>
                                        <th>Position</th>
                                        <th>Company</th>
                                        <th>Location</th>
                                        <th>Posted Date</th>
                                        <th>Salary</th>
                                        <th>Link</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${cachedJobs.map((job: Job) => `
                                        <tr>
                                            <td>${escapeHtml(job.position || 'N/A')}</td>
                                            <td>${escapeHtml(job.company || 'N/A')}</td>
                                            <td>${escapeHtml(job.location || 'N/A')}</td>
                                            <td>${escapeHtml(job.date || 'N/A')} (${escapeHtml(job.agoTime || 'N/A')})</td>
                                            <td>${escapeHtml(job.salary || 'N/A')}</td>
                                            <td><a href="${escapeHtml(job.jobUrl || '#')}" target="_blank" class="job-link rounded-md p-1 hover:bg-indigo-50">View Job</a></td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <script>
                        document.getElementById('filterForm').addEventListener('submit', function(event) {
                            event.preventDefault(); // Prevent default form submission

                            // Since job data is fetched once at server startup,
                            // this client-side form now only provides visual filtering
                            // or serves as an indicator of what parameters were used.
                            // The actual job search on the server does NOT react to these changes.
                            // To change job search parameters, you must restart the Node.js server
                            // with new command-line arguments.
                            alert('To change job search parameters, please restart the Node.js server with new command-line arguments. The current display is based on the initial server startup parameters.');
                        });


                        document.getElementById('exportCsvBtn').addEventListener('click', function() {
                            const table = document.getElementById('jobTable');
                            let csv = [];
                            // Get table headers
                            const headers = Array.from(table.querySelectorAll('th')).map(th => th.innerText.trim());
                            csv.push(headers.join(','));

                            // Get table rows
                            table.querySelectorAll('tbody tr').forEach(row => {
                                const rowData = Array.from(row.querySelectorAll('td')).map((td, index) => {
                                    // For the link column, get the href
                                    if (index === 5) { // Assuming link is the 6th column (index 5)
                                        return td.querySelector('a') ? td.querySelector('a').href : '';
                                    }
                                    // Escape double quotes and enclose in double quotes if it contains commas or double quotes
                                    let text = td.innerText.trim();
                                    text = text.replace(/"/g, '""'); // Escape double quotes
                                    if (text.includes(',') || text.includes('"') || text.includes('\\n') || text.includes('\\r')) {
                                        text = \`"\${text}"\`;
                                    }
                                    return text;
                                });
                                csv.push(rowData.join(','));
                            });

                            // Create a Blob and download it
                            const csvFile = new Blob([csv.join('\\n')], { type: 'text/csv' });
                            const downloadLink = document.createElement('a');
                            downloadLink.download = 'linkedin_jobs.csv';
                            downloadLink.href = window.URL.createObjectURL(csvFile);
                            downloadLink.style.display = 'none';
                            document.body.appendChild(downloadLink);
                            downloadLink.click();
                            document.body.removeChild(downloadLink);
                        });
                    </script>
                </body>
                </html>
            `);
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);

    // Fetch jobs once on server startup
    const queryOptions = getEffectiveQueryOptions();
    console.log('Performing initial job search...');

    (linkedIn as any).query(queryOptions)
        .then((response: Job[] | unknown) => {
            if (Array.isArray(response)) {
                cachedJobs = response;
                console.log(`Initial fetch completed. Fetched ${cachedJobs.length} jobs.`);
            } else {
                console.warn('Initial fetch: API response was not an array or was empty:', response);
                cachedErrorMessage = 'No jobs found or unexpected API response format during initial fetch.';
            }
        })
        .catch((error: any) => {
            console.error('Initial fetch: Error fetching jobs:', error);
            cachedErrorMessage = `Failed to fetch jobs during initial startup: ${error.message || 'Unknown error'}. Please check your connection or API limits.`;
            if (error.response && error.response.status === 429) {
                cachedErrorMessage += " You might have hit a rate limit. Please wait and try again.";
            }
        })
        .finally(() => {
            isInitialFetchComplete = true; // Mark initial fetch as complete
            // Open the browser only once after the initial fetch is done
            open(`http://localhost:${PORT}`)
                .then(() => console.log(`Opened http://localhost:${PORT} in browser.`))
                .catch(err => console.error('Failed to open browser:', err));
        });
});
