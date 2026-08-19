# ⚔️ OSRS Trading Tools

A comprehensive, full-stack Old School RuneScape market analysis platform, paper trading simulator, autonomous AI trading assistant, and Discord alert bot.

Built to help OSRS traders browse real-time Grand Exchange prices, detect arbitrage opportunities, calculate tax-aware recipe profits, run autonomous trading agents, and receive price alerts directly in Discord.

> [!CAUTION]
> ### ⚠️ Project Disclaimer & AI-Generated Code Notice
> - **AI-Generated Code**: The codebase in this repository was generated with the assistance of AI tools and is provided on an **"AS IS"** basis, without warranty of any kind. **Use at your own risk.**
> - **Hobby & Development Use Only**: This project is built strictly as a personal hobby, educational, and experimental application. It is **NOT hardened, audited, or tested for production environments, commercial use, or handling sensitive data**.

---

## 📑 Table of Contents

- [Tech Stack](#-tech-stack)
- [Key Features](#-key-features)
- [⚡ Quick Start (Local Setup in 60s)](#-quick-start-local-setup-in-60s)
- [🔑 Environment Variables Guide](#-environment-variables-guide)
  - [1. Minimum Core Setup (Web App)](#1-minimum-core-setup-web-app)
  - [2. AI Features (Google Gemini)](#2-ai-features-google-gemini)
  - [3. Discord OAuth Authentication](#3-discord-oauth-authentication)
  - [4. Discord Bot Service](#4-discord-bot-service)
  - [5. App Security & Admin Settings](#5-app-security--admin-settings)
- [🤖 Google Gemini API Guide & Important Terms](#-google-gemini-api-guide--important-terms)
- [🛠️ Available Scripts](#️-available-scripts)
- [👑 Admin Setup](#-admin-setup)
- [🚀 Deployment (Railway)](#-deployment-railway)
- [🔒 Security & Best Practices](#-security--best-practices)
- [📄 Disclaimers & License](#-disclaimers--license)

---

## 💻 Tech Stack

- **Frontend**: React 18, Vite, TypeScript, Lucide Icons (`packages/frontend`)
- **Backend**: Node.js, Express, TypeScript (`packages/backend`)
- **Shared**: Shared types, logger, and utilities (`packages/shared`)
- **Database**: PostgreSQL with partition-based time series for historical price aggregation
- **AI / LLM**: `@google/genai` (Google Gemini 3.5 Flash Lite / Gemini 2.5 Flash)
- **Discord Bot**: `discord.js` v14 with Slash Commands (`packages/discord-bot`)

---

## ✨ Key Features

- **📊 Real-time OSRS Market Data**: Fetches the latest Grand Exchange prices every minute from the official OSRS Wiki API, complete with 5m, 1h, 6h, and 24h interactive charts, buy limits, volumes, and tax-aware calculations.
- **🔄 Arbitrage Scanner**: Instant profit analysis for unpacking/packing armor item sets and potion decanting (1, 2, 3, and 4-dose conversions).
- **⚒️ Profitable Skill Recipes**: Calculates real-time profit and ROI for crafting, smithing, fletching, cooking, and herblore recipes (with GE tax deducted).
- **🤖 Autonomous AI Trading Agents**: Create AI trading bots with custom goals and trigger rules that monitor market conditions and formulate trading actions.
- **💬 Global AI Assistant**: Embedded AI chat widget powered by Google Gemini to analyze market trends, compare items, and recommend strategies.
- **🎮 GE Paper Trading Game & Hiscores**: Test your trading strategies in a simulated Grand Exchange market using real-time prices, portfolio tracking, and competitive leaderboard hiscores.
- **🔔 Discord Price Alerts**: Set simple percentage-change alerts, target price thresholds (above/below), and advanced multi-criteria filters that send DMs to traders.
- **🛡️ Admin Dashboard**: In-app management to trigger recipe synchronization, import/export custom recipes in JSON, backfill historical price data from the OSRS Wiki, and configure bot quiet hours.

---

## ⚡ Quick Start (Local Setup in 60s)

You **do not** need any API keys or complex configuration to run the core web application locally!

### Prerequisites
- **Node.js LTS** (18+ recommended)
- **Docker** & **Docker Compose** (for the local PostgreSQL database)

### 3-Step Setup

1. **Start the database:**
   ```bash
   docker compose up -d
   ```
   *Starts PostgreSQL on port `5432` with username `user`, password `password`, and database `osrs_trading`.*

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Start the backend and frontend:**
   - **Terminal 1 (Backend):**
     ```bash
     npm run dev:backend
     ```
   - **Terminal 2 (Frontend):**
     ```bash
     npm run dev:frontend
     ```

Open **`http://localhost:5173`** in your browser. You're ready to trade! 🎉

---

## 🔑 Environment Variables Guide

Environment variables are organized into tiers based on the features you want to enable.

### 1. Minimum Core Setup (Web App)

To run the web app locally, the default settings work out of the box. If you customize settings, create `packages/backend/.env`:

| Variable | Location | Necessity | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `DATABASE_URL` | `packages/backend/.env` | **Required** | `postgresql://user:password@localhost:5432/osrs_trading` | PostgreSQL connection string (provided by Docker). |
| `PORT` | `packages/backend/.env` | Optional | `4000` | Port for the backend Express server. |
| `JWT_SECRET` | `packages/backend/.env` | Optional (Dev) / **Required (Prod)** | Dev default key | Secret used for JWT authentication tokens. |
| `VITE_API_URL` | `packages/frontend/.env` | Optional | `""` (uses proxy) | In production, set to your backend URL (e.g. `https://api.yourdomain.com`). |

---

### 2. AI Features (Google Gemini)

Required **only** if you want to use the Global Chat AI Widget, Autonomous Trading Agents, or AI Market Highlights.

| Variable | Location | Necessity | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `GEMINI_API_KEY` | `packages/backend/.env` | Optional | *None* | Your Google Gemini API key. See [Gemini API Guide](#-google-gemini-api-guide--important-terms). |
| `GEMINI_MODEL` | `packages/backend/.env` | Optional | `gemini-3.5-flash-lite` | Gemini model name (e.g., `gemini-3.5-flash-lite`, `gemini-2.5-flash`). |

> [!NOTE]
> If `GEMINI_API_KEY` is not provided, the core web app works normally; AI endpoints will gracefully return a notice that the AI service is disabled.

---

### 3. Discord OAuth Authentication

Required **only** if you want users to log in using the **"Login with Discord"** button. (Traditional username/password registration works without this).

| Variable | Location | Necessity | Description |
| :--- | :--- | :--- | :--- |
| `DISCORD_CLIENT_ID` | `packages/backend/.env` | Optional | Discord Developer Application Client ID. |
| `DISCORD_CLIENT_SECRET` | `packages/backend/.env` | Optional | Discord Developer Application Client Secret. |
| `DISCORD_REDIRECT_URI` | `packages/backend/.env` | Optional | Redirect callback URI: `http://localhost:5173/auth/discord/callback` (local) or `https://<frontend-url>/auth/discord/callback` (prod). |
| `DISCORD_GUILD_ID` | `packages/backend/.env` | Optional | *(Optional)* Restrict Discord logins to members of a specific Discord server. |
| `DISCORD_BOT_TOKEN` | `packages/backend/.env` | Optional | *(Optional)* Bot token needed if checking guild membership. |

---

### 4. Discord Bot Service

Required **only** if you are running the Discord Bot process (`npm run dev:bot`). Create `packages/discord-bot/.env`:

| Variable | Location | Necessity | Default | Description |
| :--- | :--- | :--- | :--- | :--- |
| `DISCORD_BOT_TOKEN` | `packages/discord-bot/.env` | **Required** (for bot) | *None* | Bot token from Discord Developer Portal. |
| `DISCORD_CLIENT_ID` | `packages/discord-bot/.env` | **Required** (for bot) | *None* | Application ID for registering slash commands. |
| `DATABASE_URL` | `packages/discord-bot/.env` | **Required** (for bot) | *None* | PostgreSQL database connection string. |
| `BOT_API_KEY` | `packages/discord-bot/.env` & `packages/backend/.env` | **Required** (for bot) | *None* | Shared secret string to authenticate bot requests to the backend. |
| `BACKEND_URL` | `packages/discord-bot/.env` | Optional | `http://localhost:4000` | Backend API URL (use internal networking on Railway). |
| `FRONTEND_URL` | `packages/discord-bot/.env` | Optional | `http://localhost:5173` | Frontend URL for links in Discord notifications. |
| `DISCORD_HIGHLIGHTS_CHANNEL_ID` | `packages/discord-bot/.env` | Optional | *None* | Channel ID to post daily automated market summaries. |
| `BOT_SLEEP_START` / `BOT_SLEEP_END` | `packages/discord-bot/.env` | Optional | `-1` (disabled) | Quiet hours in UTC (0-23) to pause alert DMs. |

---

### 5. App Security & Admin Settings

Optional backend configuration parameters in `packages/backend/.env`:

| Variable | Location | Default | Description |
| :--- | :--- | :--- | :--- |
| `DISABLE_REGISTRATION` | `packages/backend/.env` | `false` | Set to `true` to disable public registration (invite/admin-only). |
| `REQUIRE_AUTH` | `packages/backend/.env` | `false` | Set to `true` to require login before viewing market data and tools. |
| `DATA_RETENTION_DAYS` | `packages/backend/.env` | `7` | Days to retain fine-grained 5-minute historical price points. |
| `WIKI_CONTACT_INFO` | `packages/backend/.env` | `unknown` | Contact string included in the OSRS Wiki API `User-Agent` header (best practice). |
| `LOG_LEVEL` | `packages/backend/.env` | `info` | Logging verbosity (`debug`, `info`, `warn`, `error`). |
| `ADMIN_USERNAME` | `packages/backend/.env` | *None* | Auto-creates or promotes this user to admin on startup. |
| `ADMIN_PASSWORD` | `packages/backend/.env` | *None* | Password for the auto-seeded admin user. |
| `ADMIN_EMAIL` | `packages/backend/.env` | *None* | Email for the auto-seeded admin user. |

For template files, see:
- [`packages/backend/.env.example`](packages/backend/.env.example)
- [`packages/discord-bot/.env.example`](packages/discord-bot/.env.example)
- [`packages/frontend/.env.example`](packages/frontend/.env.example)

---

## 🤖 Google Gemini API Guide & Important Terms

The AI assistant and autonomous trading agents integrate with the Google Gemini API using the official `@google/genai` SDK.

### How to Get a Free Gemini API Key:
1. Visit [Google AI Studio](https://aistudio.google.com/).
2. Sign in with your Google account.
3. Click on **"Get API key"** (or "Create API key in new project").
4. Copy your API key.
5. Paste it into `packages/backend/.env`:
   ```bash
   GEMINI_API_KEY=your_api_key_here
   GEMINI_MODEL=gemini-3.5-flash-lite
   ```

### ⚠️ Important Gemini Terms of Service & Privacy Notes:
When configuring and using the Google Gemini API, you must review and comply with the [Google APIs Terms of Service](https://developers.google.com/terms) and the [Gemini API Additional Terms of Service](https://ai.google.dev/gemini-api/terms).

> [!WARNING]
> Please be aware of the following critical conditions:
> 1. **Data Logging on Free Tier**: When using the free-of-charge Gemini API tier, **Google uses your prompts, responses, and related data to train, improve, and develop Google products and machine-learning technologies**. Human reviewers may also read and annotate submitted content. **Never submit sensitive, confidential, private, or proprietary data.**
> 2. **Age & Child Safety Restrictions**: The Gemini API is **not permitted for use by children or users under the minimum age specified by Google in their terms of service**.
> 3. **Prototyping & Development Only**: The free tier is intended strictly for personal development, prototyping, and experimentation, and is **not intended or licensed for production or mission-critical use**.

---

## 🛠️ Available Scripts

From the repository root:

| Command | Description |
| :--- | :--- |
| `npm run dev:backend` | Starts the Express backend in development mode with hot reload (`http://localhost:4000`). |
| `npm run dev:frontend` | Starts the Vite React frontend with hot module replacement (`http://localhost:5173`). |
| `npm run dev:bot` | Starts the Discord bot service. |
| `npm run build` | Builds all packages (`shared`, `backend`, `frontend`, `discord-bot`). |
| `npm run create-admin` | CLI utility to create or promote an admin account in the database. |

---

## 👑 Admin Setup

Admin privileges can be granted in four ways:

1. **First Registered User**: On a fresh database with 0 users, the very first user to register (`POST /api/auth/register` or via UI) automatically receives admin status.
2. **Auto-Seeding via `.env`**: Set `ADMIN_USERNAME` and `ADMIN_PASSWORD` in `packages/backend/.env` to auto-seed an admin on startup.
3. **CLI Script**: Run the admin creation script directly:
   ```bash
   # Uses ADMIN_USERNAME / ADMIN_PASSWORD from .env:
   npm run create-admin

   # Or pass explicit credentials:
   npm run create-admin -- --username customadmin --password mysecretpassword --email admin@example.com
   ```
4. **Admin Dashboard**: Existing admins can create and manage users directly in the Admin page of the UI.

---

## 🚀 Deployment (Railway)

The repository is pre-configured for seamless monorepo deployment to [Railway](https://railway.com?referralCode=HI3d1h).

### Quick Deployment Steps:

1. **Create a Railway Project**: Select **"Deploy from GitHub repo"** and choose this repository.
2. **Add PostgreSQL**: In Railway, click **"+ New"** → **"Database"** → **"PostgreSQL"**.
3. **Deploy Backend Service**:
   - **Build Command**: `npm install && npm run build:backend`
   - **Start Command**: `npm start --workspace backend`
   - **Networking**: Click **"Generate Domain"**
   - **Environment Variables**:
     ```
     DATABASE_URL=${{Postgres.DATABASE_URL}}
     JWT_SECRET=your-secure-random-secret
     PORT=4000
     GEMINI_API_KEY=your-gemini-key (optional, for AI features)
     BOT_API_KEY=your-bot-api-key (optional, if running bot)
     DISCORD_CLIENT_ID=your-discord-client-id (optional, for OAuth)
     DISCORD_CLIENT_SECRET=your-discord-client-secret (optional, for OAuth)
     DISCORD_REDIRECT_URI=https://<frontend-url>/auth/discord/callback (optional)
     ```
4. **Deploy Frontend Service**:
   - **Build Command**: `npm install && npm run build:frontend`
   - **Start Command**: `npm start --workspace frontend`
   - **Networking**: Click **"Generate Domain"**
   - **Environment Variables**:
     ```
     VITE_API_URL=https://<your-backend-railway-domain>.up.railway.app
     ```
5. **Deploy Discord Bot Service (Optional)**:
   - **Build Command**: `npm install && npm run build:bot`
   - **Start Command**: `npm start --workspace discord-bot`
   - **Networking**: *No public domain needed*
   - **Environment Variables**:
     ```
     DATABASE_URL=${{Postgres.DATABASE_URL}}
     DISCORD_BOT_TOKEN=your-bot-token
     DISCORD_CLIENT_ID=your-client-id
     BOT_API_KEY=your-bot-api-key (must match backend)
     BACKEND_URL=http://${{Backend.RAILWAY_PRIVATE_DOMAIN}}:${{Backend.PORT}}
     ```

For comprehensive guides, checklists, and troubleshooting:
- 📘 **[Full Railway Deployment Guide](.agent/workflows/deploy-to-railway.md)**
- 📋 **[Railway Deployment Checklist](RAILWAY_CHECKLIST.md)**
- 📖 **[Quick Deployment Reference](DEPLOYMENT.md)**

---

## 🔒 Security & Best Practices

- **Never commit `.env` files**: All `.env` files are ignored by git in `.gitignore`.
- **Secrets in Production**: Always generate strong random secrets for `JWT_SECRET` and `BOT_API_KEY` in production environments:
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ```
- **OSRS Wiki Politeness**: Set `WIKI_CONTACT_INFO` in production to provide contact information in the `User-Agent` header when querying OSRS Wiki APIs.

---

## 📄 Disclaimers & License

### Disclaimer of Liability
This software is provided "AS IS", without warranty of any kind, express or implied. In no event shall the authors or copyright holders be liable for any claim, damages, or other liability arising from the use of this software, in-game trading losses, or reliance on data provided by this tool or third-party APIs. Old School RuneScape is a registered trademark of Jagex Limited. This project is not affiliated with or endorsed by Jagex Limited.

### License
This project is licensed under the [MIT License](LICENSE).
