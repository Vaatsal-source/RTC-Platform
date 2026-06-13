Markdown
# 🚀 Real-Time Team Chat Platform

A production-grade, distributed team communication platform designed to emulate core Slack features. This system is built using a **Monorepo architecture**, raw WebSockets (`ws`), event-driven background processing, and a Redis pub/sub backplane for horizontal scaling.

---

## 🏗️ Monorepo Architecture & Tech Stack

We use **pnpm workspaces** to manage discrete applications and shared internal packages. 

### `apps/` (Runnable Services)
* **`web`**: React Frontend. Powered by Vite, TypeScript, Tailwind CSS v4, Zustand (client state), and React Query (server state).
* **`api`**: REST API Server. Handles user authentication (JWT), workspace management, and database operations.
* **`websocket`**: Raw WebSocket Server. Manages active `ws` connections, channel subscriptions, and presence tracking.
* **`worker`**: Background Job Processor. Uses BullMQ to handle decoupled tasks like notifications and audit logs asynchronously.

### `packages/` (Shared Internal Modules)
* **`ui`**: Shared atomic React components (Buttons, Inputs, Dialogs).
* **`database`**: Global Mongoose schemas, models, and connection logic.
* **`shared-types`**: TypeScript interfaces shared across frontend and backend (e.g., WS message payloads, API responses).
* **`config`**: Shared environment variable validation and constants.
* **`logger`**: Centralized Winston/Pino structured logging setup.

---

## ⚙️ Prerequisites

Every contributor must have the following installed locally:
1. **Node.js** (v18.x or higher)
2. **pnpm** (Install globally via `npm install -g pnpm`)
3. **Docker Desktop** (For local Redis and MongoDB instances)
4. **Git** ---

## 💻 Local Development Setup

Follow these commands precisely to clone, configure, and boot the development environment. **Pay close attention to the directory context for each command.**

### 1. Clone & Initialize
Open your terminal in your desired workspace folder:
```bash
git clone [https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git](https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git)
cd YOUR_REPO_NAME
2. Install Root Dependencies
Run this from the root directory of the project. This command automatically resolves and links dependencies across all apps/ and packages/.

Bash
# Directory: / (Root)
pnpm install
3. Native Build Scripts Approval (CRITICAL FOR WINDOWS)
Because we are using tools that compile native Node.js binaries (like msgpackr-extract or esbuild), pnpm will strictly block these scripts for security reasons, causing subsequent commands to fail.
To whitelist our dependencies, run:

Bash
# Directory: / (Root)
pnpm approve-builds
4. Boot Local Infrastructure
Ensure Docker Desktop is running. This will spin up isolated MongoDB and Redis containers.

Bash
# Directory: / (Root)
docker-compose up -d
5. Start the Frontend Development Server
Navigate specifically to the frontend application directory and boot Vite:

Bash
# Directory: apps/web
cd apps/web
pnpm run dev
🌐 The application will be live at http://localhost:5173.

🚨 Troubleshooting & Known Issues
If you encounter errors during setup, check this registry before debugging.

Error: [ERR_PNPM_IGNORED_BUILDS] Ignored build scripts
Trigger: Running pnpm install or pnpm run dev on Windows.

Cause: pnpm blocked a native compilation script in the dependency tree.

Fix: Run pnpm approve-builds in the root directory, then retry your command.

Error: Cannot find type definition file for 'vite/client'
Trigger: Viewing tsconfig.app.json or compiling the frontend.

Cause: The TS compiler cannot locate Vite's ambient environment types in a nested monorepo.

Fix: Ensure apps/web/tsconfig.app.json contains "types": ["vite/client"] inside the "compilerOptions" array.

Error: PostCSS / Tailwind Overlay Warning in Browser
Trigger: Starting the Vite server and seeing a red overlay complaining about PostCSS.

Cause: You are using legacy Tailwind v3 configs (like tailwind.config.js) in a Tailwind v4 environment.

Fix: 1. Delete tailwind.config.js and postcss.config.js from apps/web.
2. Ensure @tailwindcss/vite is installed and added to the plugins array in vite.config.ts.
3. Ensure apps/web/src/index.css contains exactly one line: @import "tailwindcss";.

📜 Coding Guidelines
Tailwind v4: We do not use a tailwind.config.js file. All utility classes are resolved automatically by the @tailwindcss/vite plugin.

Cross-Boundary Imports: Never import code directly from apps/api into apps/web. If both need the code (like a TypeScript interface), move it to packages/shared-types and import it using the monorepo alias (@repo/shared-types).

Branching Strategy: Use feature branches (e.g., feat/auth-jwt, fix/ws-memory-leak) and submit Pull Requests to main.
