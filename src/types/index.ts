// src/types/index.ts

export interface Job {
  position: string;
  company: string;
  companyLogo?: string;
  location: string;
  date: string;
  agoTime: string;
  salary?: string;
  jobUrl: string;
  isVetted?: boolean;
}

export interface QueryOptions {
  keyword: string;
  location: string;
  dateSincePosted: "24hr" | "past Week" | "past Month" | "";
  limit: string;
  jobType: "full time" | "part time" | "contract" | "temporary" | "volunteer" | "internship" | "";
  remoteFilter: "on site" | "remote" | "hybrid" | "";
  salary: "40000" | "60000" | "80000" | "100000" | "120000" | "";
  experienceLevel: "internship" | "entry level" | "associate" | "senior" | "director" | "executive" | "";
  sortBy: "recent" | "relevant";
}

export interface SearchGoal {
  summary: string;
  titles: string[];
}
