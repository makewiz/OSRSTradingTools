## OSRS Trading Tools

Hobby web app to help Old School RuneScape traders browse items, inspect GE margins and volumes, and connect to a Discord bot for alerts.

### Tech stack

- **Frontend**: React + Vite + TypeScript (`packages/frontend`)
- **Backend**: Node + Express + TypeScript (`packages/backend`)
- **Discord bot**: `discord.js` + TypeScript (`packages/discord-bot`)

### Prerequisites

- Recent **Node.js LTS** (18+ recommended for built-in `fetch`)

### Install dependencies

From the project root:

```bash
npm install
```

This will install dependencies for all workspaces.

### Running the backend (OSRS price API)

```bash
npm run dev:backend
```

The backend starts on `http://localhost:4000` and exposes:

- `GET /api/health` – simple healthcheck
- `GET /api/items` – combined OSRS item mapping, latest prices, and volumes, with:
  - name, examine, members flag
  - wiki URL, icon URL
  - buy price, sell price, margin, daily volume

Data is cached in memory for ~1 minute to stay friendly to the OSRS Wiki APIs.

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

### Running the Discord bot (skeleton)

Create a `.env` file in `packages/discord-bot` (do **not** commit it) with:

```bash
DISCORD_BOT_TOKEN=your_discord_bot_token_here
```

Then:

```bash
cd packages/discord-bot
npm run dev
```

The bot currently just logs in and is ready for future commands / alerts that will integrate with the backend.

### Security and secrets

- **Do not commit** any API keys, Discord tokens, or secrets.
- Use environment variables (e.g. `.env` files in each package, kept out of git).

### Next steps / ideas

- Add a proper login system and user-specific server-side favourites & watchlists
- Implement Discord commands to subscribe to items and push price/AI highlights
- Add more trading tools (ROI calculators, flip tracking, price-change history)


