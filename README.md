## OSRS Trading Tools

Hobby web app to help Old School RuneScape traders browse items, inspect GE margins and volumes, and connect to a Discord bot for alerts.

### Tech stack

- **Frontend**: React + Vite + TypeScript (`packages/frontend`)
- **Backend**: Node + Express + TypeScript (`packages/backend`)
- **Shared**: Shared types and utilities (`packages/shared`)
- **Database**: PostgreSQL (`pg`) for price history and user data
- **Discord bot**: `discord.js` + TypeScript (`packages/discord-bot`)

### Features
- **Real-time Pricing**: Fetches latest OSRS prices every minute.
- **Market Analysis**: 
  - **Arbitrage**: Find profitable item sets and potion decanting opportunities.
  - **Risk Analysis**: View item volatility and risk metrics alongside profit potential.
  - **Pattern Detection**: Identify daily trends and price anomalies in the Highlights feed.
- **Profitable Recipes**: Calculate profit for crafting, smithing, and processing skills with **tax-aware** calculations.
- **Global Chat Widget**: Integrated AI assistant to query market data from anywhere in the app.
- **Discord Alerts**: Watch items and get notified of significant price changes.
- **Admin Dashboard**: Manage recipes (sync, export/import), backfill historical data, and configure bot settings.

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
BOT_API_KEY=your-secure-random-api-key
OPENAI_API_KEY=your-openai-api-key-optional

# Feature Flags & Config
DISABLE_REGISTRATION=false # Set true to close public registration
REQUIRE_AUTH=false         # Set true to force login for viewing items
DATA_RETENTION_DAYS=7      # Limit for historical data retention (affects backfill)
```

See [`.env.example`](packages/backend/.env.example) for a complete template.

Then start the backend:

```bash
npm run dev:backend
```

The backend starts on `http://localhost:4000` and exposes:

- `GET /api/health` – simple healthcheck
- `GET /api/items` – combined OSRS item mapping, latest prices, and volumes
- `POST /api/auth/*` - Authentication endpoints (register, login, Discord OAuth)
- `GET/POST /api/watch` - Item watch management
- `GET /api/recipes` - Get profitable recipes with various filters
- `POST /api/admin/*` - Admin management (sync recipes, cache control, history backfill)

**Database & Scheduled Fetching**:
- PostgreSQL database stores price history and user data
- **Caching**: Latest prices are fetched every minute while the system is active.
- **History**: Price history is fetched every 5 minutes (persisted regardless of activity).
- **Data Retention**: Configurable via `DATA_RETENTION_DAYS`.
- Aggregation runs automatically every hour.

### Running the frontend

In another terminal:

```bash
npm run dev:frontend
```

Open the printed Vite URL (usually `http://localhost:5173`).

The UI lets you:

- **Interact with Market Data**:
    - Search items by name or examine text.
    - View **Highlights** with pattern and anomaly detection.
    - Explore **Arbitrage** tables for item sets and potion decanting.
- **Profitable Recipes**: Filter by skill, profit, volume, ROI (tax-aware).
- **Global Chat Widget**: Ask questions about the market from any page.
- **Account**:
    - Mark items as favourites.
    - Manage watchlists.
- **Admin**:
    - Sync recipes manually or Import/Export recipe JSON.
    - Backfill historical data from Wiki.
    - Create users and configure bot sleep times.

### Running the Discord bot

Create a `.env` file in `packages/discord-bot` (do **not** commit it) with:

```bash
DISCORD_BOT_TOKEN=your_discord_bot_token_here
DISCORD_CLIENT_ID=your_discord_client_id
DATABASE_URL=postgresql://user:password@localhost:5432/osrs_trading_tools
BOT_API_KEY=must-match-backend-api-key
BACKEND_URL=http://localhost:4000
```

Then:

```bash
npm run dev:bot
```

The bot logs in and provides slash commands:
- `/watch <item_id> [threshold]`: Get notified when an item's price changes by X% (default 5%).
- `/highlights`: Get a daily market analysis report with top movers and AI summary.
- `/listwatches`: See your active watches.

### Security and secrets

- **Do not commit** any API keys, Discord tokens, or secrets.
- Use environment variables (e.g. `.env` files in each package, kept out of git).

### Next steps / ideas

- Add user specific trading portfolio
- Add premium roles and limit features to premium users (e.g. watch limit, chat request limit, risk analysis limit) These limits should be configurable in the admin panel. They are important in large production environments to prevent abuse and manage costs.
- Add more filtering options to arbritage page
- Add hourly profit calculation like the one on arbritage page to items page, taking into account both the buy limit and the volume data.



