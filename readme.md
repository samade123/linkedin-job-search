LinkedIn Job Search Application (TypeScript)
============================================

TLDR
-----

This Node.js TypeScript app searches LinkedIn for jobs. It's configured via command-line arguments (or defaults if none are provided). Results are displayed in a web table and can be exported to CSV.

To run:

1. `npm install`

2. `npm run build`

3. `node dist/server.js -- --keyword="React" --location="London"` (or just `npm start` for defaults)

4. Open `http://localhost:3000` in your browser.

✨ Features
----------

- Configurable Job Search: Easily search LinkedIn job listings by keywords, location, date posted, job type, remote options, salary, and experience level.

- Smart Defaults: By default, it searches for "Vue.js" and "Angular" jobs posted in the "last 7 days" with a limit of "100" results (global location by default).

- Interactive Table: View your search results in a dynamic HTML table that's easy to read and navigate.

- Filter Options: Refine your search directly on the page using a user-friendly filtering interface.

- CSV Export: Quickly export the displayed job data to a CSV file for offline analysis or record-keeping.

- Modern UI: Built with Tailwind CSS for a clean, responsive, and modern user experience.

🛠️ Prerequisites
-----------------

Before you get started, make sure you have the following installed on your system:

- Node.js: Version 14 or higher (LTS is recommended). You can download it from [nodejs.org](https://nodejs.org/ "null").

- npm: Node Package Manager, which comes bundled with Node.js.

🚀 Installation & Usage
-----------------------

Follow these simple steps to set up and run the application on your local machine:

### 1\. Create Your Project

First, create a new folder for your project (e.g., `linkedin-job-app-ts`) and place the provided `package.json`, `tsconfig.json`, `types/linkedin-jobs-api.d.ts`, and `server.ts` files inside it. Ensure the `types` folder is correctly placed in your project root.

### 2\. Install Dependencies

Open your terminal or command prompt, navigate to your new project directory, and install all the necessary packages:

```
npm install

```

### 3\. Compile TypeScript

Before the application can run, you need to compile the TypeScript code into JavaScript. Execute this command:

```
npm run build

```

This will create a `dist` folder containing the compiled `server.js` file.

### 4\. Start the Application

You have a few options for starting the server:

- Using npm script (Recommended for ease of use):

    ```
    npm start

    ```

    To pass command-line arguments:

    ```
    node dist/server.js -- --keyword="React" --location="London" 

    ```

- Development Mode (with auto-restart on code changes via Nodemon):

    ```
    npm run dev

    ```

    To pass command-line arguments in development mode:

    ```
    npm run dev -- --keyword="Python" --dateSincePosted="past Month" --remoteFilter="remote"

    ```

    *(If you don't have `nodemon` installed globally, you might need to install it first: `npm install -g nodemon`)*

- Direct Node.js execution (after compilation):

    You can directly run the compiled JavaScript file.

    ```
    node dist/server.js

    ```

    To pass command-line arguments:

    ```
    node dist/server.js --keyword="GoLang" --sortBy="recent"

    ```

    (Note: When running directly with `node`, you don't need the extra `--` before the arguments.)

### 5\. Access in Your Browser

Once the server is running, open your web browser and go to:

```
http://localhost:3000

```

🔍 How to Use Filters
---------------------

At the top of the page, you'll find a form to refine your job search. Please note: These filters are for displaying the currently loaded data in the browser. The actual job search parameters on the server are determined *only* by the hardcoded defaults and any command-line arguments you provide when starting the server. To change the jobs being searched for, you need to restart the Node.js application with different command-line arguments.

- Keywords: Enter job titles or specific skills (e.g., `React, Node.js, Developer`).

- Location: Specify a city, region, or use `remote` for remote-only jobs (e.g., `London, England`, `New York`, `remote`).

- Date Posted: Select a timeframe like `Past Week`, `Past 24 Hours`, `Past Month`, or `Anytime`.

- Limit: Control the maximum number of results to fetch (default is 100).

- Job Type, Remote, Experience Level, Sort By: Use the dropdown menus for more granular control over your search.

After making your selections, click the "Apply Filters" button. This will refresh the page and update the URL, but the job data fetched from LinkedIn will remain based on the server's startup parameters.

📄 Exporting Data to CSV
------------------------

To get the job data from the table into a CSV file:

1. Apply any filters you want on the client-side to refine the *displayed* data.

2. Click the "Export to CSV" button.

A file named `linkedin_jobs.csv` will automatically download to your computer, containing all the visible table data.

⚠️ Important Notes
------------------

- This application uses the [linkedin-jobs-api](https://github.com/drakehrm/linkedin-jobs-api "null") by [drakehrm](https://github.com/drakehrm "null"). Credit to the creator for this helpful API!

- This is an unofficial API. Please be mindful of and adhere to LinkedIn's terms of service and any applicable API usage policies.

- The API has rate limiting (typically 100 requests per hour per IP address). If you exceed this, you might receive an error message and need to wait before making more requests.

- Job details, especially salary information, might not always be available or consistent, as this depends on the data provided by the API itself.

- Server-Side Parameters Only: The job search executed by the Node.js server is configured exclusively via hardcoded defaults and command-line arguments provided at startup. Client-side form submissions will update the URL, but they will not trigger a new job search on the server with those URL parameters. To change the search criteria for the job data itself, you must restart the Node.js application with updated command-line arguments.

🤝 Contributing
---------------

Contributions are welcome! If you have suggestions or want to improve the application, feel free to open issues or submit pull requests.
