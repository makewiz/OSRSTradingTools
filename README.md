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
- **Market Analysis**: Identifies high margin items, volume spikes, and price drops.
- **Profitable Recipes**: Calculate profit for crafting, smithing, and other processing skills.
- **AI Integration**: Generates daily market summaries using OpenAI (optional).
- **Discord Alerts**: Users can watch items and get notified of price changes.

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
- `GET /api/recipes` - Get profitable recipes with various filters
- `POST /api/admin/*` - Admin management (sync recipes, cache control)

**Database & Scheduled Fetching**:
- PostgreSQL database stores price history and user data
- **Caching**: Latest prices are fetched every minute while the system is active (user/bot activity).
- **History**: Price history is fetched every 5 minutes (persisted regardless of activity).
- Data retention strategy:
  - **5-minute resolution**: Kept for 24 hours
  - **Hourly resolution**: Kept for 7 days
  - **6-hour resolution**: Kept for 30 days
  - **Daily resolution**: Kept for 1 year
- Aggregation runs automatically every hour to downsample data and clean up old records.

### Running the frontend

In another terminal:

```bash
npm run dev:frontend
```

Open the printed Vite URL (usually `http://localhost:5173`).

The UI lets you:

- Search items by name or examine text
- **Profitable Recipes**: filter by skill, profit, volume, and ROI
- Sort by **name, buy price, sell price, margin, volume**
- Mark items as **favourites** (stored in `localStorage`)
- Copy a simple `/watch <id> // <name>` command for Discord to your clipboard

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

- Add a proper login system and user-specific server-side favourites & watchlists
- Implement Discord commands to subscribe to items and push price/AI highlights
- Add more trading tools (ROI calculators, flip tracking, price-change history)


