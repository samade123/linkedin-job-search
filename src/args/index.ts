// src/args/index.ts
import { QueryOptions } from "../types";

/**
 * Displays help message and exits.
 */
export function showHelpAndExit() {
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
  process.exit(0);
}

/**
 * Parses command-line arguments.
 */
export function parseCommandLineArgs(): Partial<QueryOptions> {
  const args: Partial<QueryOptions> = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === "--help" || arg === "-h") {
      showHelpAndExit();
    }
    if (arg.startsWith("--")) {
      const [key, value] = arg.substring(2).split("=");
      if (key && value !== undefined) {
        switch (key) {
          case "keyword":
          case "location":
          case "limit":
            (args as any)[key] = value;
            break;
          case "dateSincePosted":
            const validDateSincePosted = ["24hr", "past Week", "past Month", ""];
            if (validDateSincePosted.includes(value)) {
              args[key] = value as QueryOptions["dateSincePosted"];
            }
            break;
          case "jobType":
            const validJobTypes = ["full time", "part time", "contract", "temporary", "volunteer", "internship", ""];
            if (validJobTypes.includes(value)) {
              args[key] = value as QueryOptions["jobType"];
            }
            break;
          case "remoteFilter":
            const validRemoteFilters = ["on site", "remote", "hybrid", ""];
            if (validRemoteFilters.includes(value)) {
              args[key] = value as QueryOptions["remoteFilter"];
            }
            break;
          case "salary":
            const validSalaries = ["40000", "60000", "80000", "100000", "120000", ""];
            if (validSalaries.includes(value)) {
              args[key] = value as QueryOptions["salary"];
            }
            break;
          case "experienceLevel":
            const validExperienceLevels = ["internship", "entry level", "associate", "senior", "director", "executive", ""];
            if (validExperienceLevels.includes(value)) {
              args[key] = value as QueryOptions["experienceLevel"];
            }
            break;
          case "sortBy":
            const validSortBys = ["recent", "relevant"];
            if (validSortBys.includes(value)) {
              args[key] = value as QueryOptions["sortBy"];
            }
            break;
        }
      }
    }
  }
  return args;
}

/**
 * Gets the effective query options by merging hardcoded defaults with command-line arguments.
 */
export function getEffectiveQueryOptions(): QueryOptions {
  const hardcodedDefaultOptions: QueryOptions = {
    keyword: "Vue.js, Angular",
    location: "london",
    dateSincePosted: "past Week",
    limit: "50",
    jobType: "",
    remoteFilter: "",
    salary: "",
    experienceLevel: "",
    sortBy: "recent",
  };

  const cmdLineArgs = parseCommandLineArgs();
  return { ...hardcodedDefaultOptions, ...cmdLineArgs };
}
