## OSRS Trading Tools

Hobby web app to help Old School RuneScape traders browse items, inspect GE margins and volumes, and connect to a Discord bot for alerts.

### Tech stack

- **Frontend**: React + Vite + TypeScript (`packages/frontend`)
- **Backend**: Node + Express + TypeScript (`packages/backend`)
- **Database**: PostgreSQL (`pg`) for price history and user data
- **Discord bot**: `discord.js` + TypeScript (`packages/discord-bot`)

### Deployment

Ready to deploy to production? See our comprehensive deployment guides:

- **📘 [Railway Deployment Guide](.agent/workflows/deploy-to-railway.md)** - Full step-by-step guide
- **📋 [Deployment Checklist](RAILWAY_CHECKLIST.md)** - Track your deployment progress
- **📖 [Quick Deployment Reference](DEPLOYMENT.md)** - Quick reference and troubleshooting

**Quick Start Deployment:**
1. Push your code to GitHub
2. Sign up at [Railway](https://railway.app)
3. Follow the [Railway deployment workflow](.agent/workflows/deploy-to-railway.md)
4. Your app will be live in ~15 minutes! 🚀


### Prerequisites

- Recent **Node.js LTS** (18+ recommended for built-in `fetch`)

### Install dependencies

From the project root:

```bash
npm install
```

This will install dependencies for all workspaces.

### Running the backend (OSRS price API)

**Optional**: Create a `.env` file in `packages/backend` to customize settings:

```bash
PORT=4000
DATABASE_URL=postgresql://user:password@localhost:5432/osrs_trading_tools
JWT_SECRET=your-secret-key-here
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret
DISCORD_REDIRECT_URI=http://localhost:5173/auth/callback
```

See [`.env.example`](.env.example) for a complete template.

Then start the backend:

```bash
npm run dev:backend
```

The backend starts on `http://localhost:4000` and exposes:

- `GET /api/health` – simple healthcheck
- `GET /api/items` – combined OSRS item mapping, latest prices, and volumes, with:
  - name, examine, members flag
  - wiki URL, icon URL
  - buy price, sell price, margin, daily volume
- `POST /api/auth/*` - Authentication endpoints (register, login, Discord OAuth)
- `GET/POST /api/watch` - Item watch management

**Database & Scheduled Fetching**:
- PostgreSQL database stores price history and user data
- Price data is fetched from OSRS Wiki APIs **every minute** and stored in the database
- Data retention strategy:
  - **Last 24 hours**: Minute-level accuracy
  - **Last 7 days**: Hourly aggregates
  - **Older data**: Daily aggregates
- Aggregation runs automatically (hourly aggregation daily at 2 AM, daily aggregation weekly)

### Running the frontend

In another terminal:

```bash
npm run dev:frontend
```

Open the printed Vite URL (usually `http://localhost:5173`).

The UI lets you:

- Search items by name or examine text
- Sort by **name, buy price, sell price, margin, volume**
- Mark items as **favourites** (stored in `localStorage`)
- Copy a simple `/watch <id> // <name>` command for Discord to your clipboard

### Running the Discord bot

Create a `.env` file in `packages/discord-bot` (do **not** commit it) with:

```bash
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id
DATABASE_URL=postgresql://user:password@localhost:5432/osrs_trading_tools
```

Then:

```bash
npm run dev:bot
```

The bot logs in and watches for price alerts, sends notifications to users based on their watched items.

### Security and secrets

- **Do not commit** any API keys, Discord tokens, or secrets.
- Use environment variables (e.g. `.env` files in each package, kept out of git).

### Next steps / ideas

- Add a proper login system and user-specific server-side favourites & watchlists
- Implement Discord commands to subscribe to items and push price/AI highlights
- Add more trading tools (ROI calculators, flip tracking, price-change history)


