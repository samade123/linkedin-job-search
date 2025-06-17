// server.ts
import express, { Request, Response } from 'express';
import path from 'path';
import linkedIn from 'linkedin-jobs-api'; // Import the LinkedIn Jobs API

const app = express();
const PORT = process.env.PORT || 3000;

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

// Function to parse command-line arguments
function parseCommandLineArgs(): Partial<QueryOptions> {
    const args: Partial<QueryOptions> = {};
    // process.argv[0] is 'node', process.argv[1] is 'server.js' (or 'dist/server.js')
    // We start parsing from index 2
    for (let i = 2; i < process.argv.length; i++) {
        const arg = process.argv[i];
        if (arg.startsWith('--')) {
            const [key, value] = arg.substring(2).split('=');
            if (key && value) {
                // Type casting for known keys to match QueryOptions
                switch (key) {
                    case 'keyword':
                    case 'location':
                    case 'limit':
                        args[key] = value;
                        break;
                    case 'dateSincePosted':
                        if (['24hr', 'past Week', 'past Month', ''].includes(value)) {
                            args[key] = value as QueryOptions['dateSincePosted'];
                        }
                        break;
                    case 'jobType':
                        if (['full time', 'part time', 'contract', 'temporary', 'volunteer', 'internship', ''].includes(value)) {
                            args[key] = value as QueryOptions['jobType'];
                        }
                        break;
                    case 'remoteFilter':
                        if (['on site', 'remote', 'hybrid', ''].includes(value)) {
                            args[key] = value as QueryOptions['remoteFilter'];
                        }
                        break;
                    case 'salary':
                        if (['40000', '60000', '80000', '100000', '120000', ''].includes(value)) {
                            args[key] = value as QueryOptions['salary'];
                        }
                        break;
                    case 'experienceLevel':
                        if (['internship', 'entry level', 'associate', 'senior', 'director', 'executive', ''].includes(value)) {
                            args[key] = value as QueryOptions['experienceLevel'];
                        }
                        break;
                    case 'sortBy':
                        if (['recent', 'relevant'].includes(value)) {
                            args[key] = value as QueryOptions['sortBy'];
                        }
                        break;
                    default:
                        console.warn(`Unknown command-line argument: --${key}`);
                        break;
                }
            }
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
    // Get the effective query options from the dedicated function
    const queryOptions: QueryOptions = getEffectiveQueryOptions();

    let jobs: Job[] = [];
    let errorMessage: string = '';

    console.log('Fetching jobs with effective options:', queryOptions);

    // Explicit Promise handling with .then().catch().finally()
    // Cast linkedIn to 'any' due to lack of declaration file
    (linkedIn as any).query(queryOptions)
        .then((response: Job[] | unknown) => {
            if (Array.isArray(response)) {
                jobs = response;
                console.log(`Fetched ${jobs.length} jobs.`);
            } else {
                console.warn('API response was not an array or was empty:', response);
                errorMessage = 'No jobs found or unexpected API response format.';
            }
        })
        .catch((error: any) => {
            console.error('Error fetching jobs:', error);
            errorMessage = `Failed to fetch jobs: ${error.message || 'Unknown error'}. Please try again later.`;
            if (error.response && error.response.status === 429) {
                errorMessage += " You might have hit a rate limit. Please wait and try again.";
            }
        })
        .finally(() => {
            // This ensures res.send is called after the promise resolves or rejects
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
                                    <input type="text" id="keyword" name="keyword" class="form-input" value="${escapeHtml(queryOptions.keyword)}">
                                </div>
                                <div>
                                    <label for="location" class="block text-sm font-medium text-gray-700 mb-1">Location:</label>
                                    <input type="text" id="location" name="location" class="form-input" value="${escapeHtml(queryOptions.location)}">
                                </div>
                                <div>
                                    <label for="dateSincePosted" class="block text-sm font-medium text-gray-700 mb-1">Date Posted:</label>
                                    <select id="dateSincePosted" name="dateSincePosted" class="form-input">
                                        <option value="past Week" ${queryOptions.dateSincePosted === 'past Week' ? 'selected' : ''}>Past Week</option>
                                        <option value="24hr" ${queryOptions.dateSincePosted === '24hr' ? 'selected' : ''}>Past 24 Hours</option>
                                        <option value="past Month" ${queryOptions.dateSincePosted === 'past Month' ? 'selected' : ''}>Past Month</option>
                                        <option value="" ${queryOptions.dateSincePosted === '' ? 'selected' : ''}>Anytime</option>
                                    </select>
                                </div>
                                <div>
                                    <label for="limit" class="block text-sm font-medium text-gray-700 mb-1">Limit:</label>
                                    <input type="number" id="limit" name="limit" class="form-input" value="${escapeHtml(queryOptions.limit)}" min="1" max="1000">
                                </div>
                                <div>
                                    <label for="jobType" class="block text-sm font-medium text-gray-700 mb-1">Job Type:</label>
                                    <select id="jobType" name="jobType" class="form-input">
                                        <option value="" ${queryOptions.jobType === '' ? 'selected' : ''}>Any</option>
                                        <option value="full time" ${queryOptions.jobType === 'full time' ? 'selected' : ''}>Full-time</option>
                                        <option value="part time" ${queryOptions.jobType === 'part time' ? 'selected' : ''}>Part-time</option>
                                        <option value="contract" ${queryOptions.jobType === 'contract' ? 'selected' : ''}>Contract</option>
                                        <option value="temporary" ${queryOptions.jobType === 'temporary' ? 'selected' : ''}>Temporary</option>
                                        <option value="volunteer" ${queryOptions.jobType === 'volunteer' ? 'selected' : ''}>Volunteer</option>
                                        <option value="internship" ${queryOptions.jobType === 'internship' ? 'selected' : ''}>Internship</option>
                                    </select>
                                </div>
                                <div>
                                    <label for="remoteFilter" class="block text-sm font-medium text-gray-700 mb-1">Remote:</label>
                                    <select id="remoteFilter" name="remoteFilter" class="form-input">
                                        <option value="" ${queryOptions.remoteFilter === '' ? 'selected' : ''}>Any</option>
                                        <option value="remote" ${queryOptions.remoteFilter === 'remote' ? 'selected' : ''}>Remote</option>
                                        <option value="on site" ${queryOptions.remoteFilter === 'on site' ? 'selected' : ''}>On-site</option>
                                        <option value="hybrid" ${queryOptions.remoteFilter === 'hybrid' ? 'selected' : ''}>Hybrid</option>
                                    </select>
                                </div>
                                <div>
                                    <label for="experienceLevel" class="block text-sm font-medium text-gray-700 mb-1">Experience Level:</label>
                                    <select id="experienceLevel" name="experienceLevel" class="form-input">
                                        <option value="" ${queryOptions.experienceLevel === '' ? 'selected' : ''}>Any</option>
                                        <option value="internship" ${queryOptions.experienceLevel === 'internship' ? 'selected' : ''}>Internship</option>
                                        <option value="entry level" ${queryOptions.experienceLevel === 'entry level' ? 'selected' : ''}>Entry Level</option>
                                        <option value="associate" ${queryOptions.experienceLevel === 'associate' ? 'selected' : ''}>Associate</option>
                                        <option value="senior" ${queryOptions.experienceLevel === 'senior' ? 'selected' : ''}>Senior</option>
                                        <option value="director" ${queryOptions.experienceLevel === 'director' ? 'selected' : ''}>Director</option>
                                        <option value="executive" ${queryOptions.experienceLevel === 'executive' ? 'selected' : ''}>Executive</option>
                                    </select>
                                </div>
                                <div>
                                    <label for="sortBy" class="block text-sm font-medium text-gray-700 mb-1">Sort By:</label>
                                    <select id="sortBy" name="sortBy" class="form-input">
                                        <option value="recent" ${queryOptions.sortBy === 'recent' ? 'selected' : ''}>Recent</option>
                                        <option value="relevant" ${queryOptions.sortBy === 'relevant' ? 'selected' : ''}>Relevant</option>
                                    </select>
                                </div>
                            </div>
                            <div class="flex justify-end gap-3 mt-4">
                                <button type="submit" class="btn btn-primary">Apply Filters</button>
                                <button type="button" id="exportCsvBtn" class="btn btn-secondary">Export to CSV</button>
                            </div>
                        </form>

                        ${errorMessage ? `<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-md relative mb-6" role="alert">
                            <strong class="font-bold">Error!</strong>
                            <span class="block sm:inline">${errorMessage}</span>
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
                                    ${jobs.map((job: Job) => `
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

                            // Since URL query parameters are no longer used for fetching,
                            // we need to dynamically build the URL to reflect the form's current state
                            // for the "Apply Filters" button to work on the client-side.
                            // This will essentially refresh the page with the new command line defaults
                            // being passed to the server via the browser's URL.
                            // This part of the client-side JavaScript remains as is to allow
                            // users to change the visible filters in the browser.

                            const keyword = document.getElementById('keyword').value;
                            const location = document.getElementById('location').value;
                            const dateSincePosted = document.getElementById('dateSincePosted').value;
                            const limit = document.getElementById('limit').value;
                            const jobType = document.getElementById('jobType').value;
                            const remoteFilter = document.getElementById('remoteFilter').value;
                            const experienceLevel = document.getElementById('experienceLevel').value;
                            const sortBy = document.getElementById('sortBy').value;

                            const params = new URLSearchParams();
                            // Client-side form submission will still build URL parameters
                            // but the server-side will ignore them for fetching job data.
                            // This means the URL will update, but the job results will only change
                            // if you restart the server with new command-line args.
                            if (keyword) params.append('keyword', keyword);
                            if (location) params.append('location', location);
                            if (dateSincePosted) params.append('dateSincePosted', dateSincePosted);
                            if (limit) params.append('limit', limit);
                            if (jobType) params.append('jobType', jobType);
                            if (remoteFilter) params.append('remoteFilter', remoteFilter);
                            if (experienceLevel) params.append('experienceLevel', experienceLevel);
                            if (sortBy) params.append('sortBy', sortBy);

                            // Redirect to the new URL with updated query parameters.
                            // The server will then reload the page, using only
                            // command-line arguments (and hardcoded defaults) for search.
                            // This means the form input values in the browser will update
                            // in the URL, but the actual job search on the server will not change
                            // unless you restart the Node.js process with different command-line args.
                            window.location.href = '/' + (params.toString() ? '?' + params.toString() : '');
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
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
