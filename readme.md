# 🚀 AI-Powered LinkedIn Job Hunter

A high-fidelity, intelligent LinkedIn job search engine built with Node.js, TypeScript, and local AI integration. Transform a simple keyword search into a professionally vetted shortlist of opportunities.

---

## ✨ Features

- **🤖 AI Search Strategist**: Automatically analyzes your filters to create a professional search intent.
- **🔍 Semantic Expansion**: Automatically identifies at least 8 "Loosely Related" job titles (synonyms and adjacent roles) to broaden your search net without missing hidden gems.
- **🛡️ 3-Stage Intelligence Pipeline**:
  - **Stage 1 (Batch Selection)**: High-speed parallel evaluation of all fetched jobs.
  - **Stage 2 (Final Narrowing)**: Semantic refinement to the top 10 most relevant candidates.
  - **Stage 3 (Strict Vetting)**: A non-destructive "Gold Standard" audit that tags jobs with an amber **Vetted** badge.
- **⚡ Strict Mode Toggle**: Integrated directly into the results table header to instantly switch between "All Potential Matches" and "Strictly Vetted" roles.
- **🎨 Glassmorphic UI**: A premium, responsive SPA built with modern CSS and Tailwind-inspired aesthetics.

---

## 🛠️ Prerequisites

- **Node.js**: v18.0.0 or higher.
- **Nexa AI Local Server**: The application expects an AI inference server running locally (compatible with Llama/OmniNeural models).
  - Default Endpoint: `http://127.0.0.1:18181/v1`
  - Recommended Model: `NexaAI/OmniNeural-4B`

---

## 🚀 Getting Started

Follow these steps to get your local job engine running:

### 1. Install Dependencies
```bash
npm install
```

### 2. Build the Project
Compile the TypeScript source into the production-ready `dist` folder:
```bash
npm run build
```

### 3. Start the Application
Launch the Express server and API:
```bash
npm start
```

### 4. Open the UI
Navigate to [http://localhost:3000](http://localhost:3000) in your modern web browser.

---

## 📦 Project Structure

```text
├── public/
│   └── index.html      # High-fidelity SPA Frontend
├── src/
│   ├── services/
│   │   └── aiService.ts # Multi-stage AI intelligence layer
│   └── types/
│       └── index.ts     # Core data contracts
├── server.ts            # Express JSON API & Static Server
└── tsconfig.json        # TypeScript configuration
```

---

## ⌨️ Available Commands

- `npm run build`: Compiles TypeScript files using `tsc`.
- `npm start`: Runs the compiled server from `dist/server.js`.
- `npm run dev`: (Optional) Runs the project in development mode using `nodemon`.

---

## ⚠️ Important Notes

- **AI Inference**: Ensure your local AI server is active before searching, as the application relies on it for goal generation and filtering.
- **Rate Limits**: This application uses the `linkedin-jobs-api`. Please respect LinkedIn's rate limits (typically ~100 requests per hour).
- **Self-Healing**: The system includes a built-in JSON self-correction mechanism to handle any erratic AI outputs.

---

## 🤝 Contributing

Contributions are welcome! Feel free to open an issue or submit a pull request if you have ideas for new filtering stages or UI enhancements.
