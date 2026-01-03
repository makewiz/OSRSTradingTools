# Walkthrough: Discord Bot Features (Phase 5)

I have successfully implemented the Discord Bot features for OSRS Trading Tools.

## Features Implemented

### 1. Slash Commands
The bot now supports the following slash commands:
- `/watch <item_id> [threshold]`: Watch an item. Warns if the day change (24h%) exceeds the threshold (default 5%).
  - Example: `/watch item_id:4151 threshold:10` (Watch Abyssal Whip for 10% change)
- `/unwatch <item_id>`: Stop watching an item.
- `/listwatches`: Shows your currently active watches.
- `/notifications <on|off>`: Globally toggle notifications for your user.
- `/help`: Show available commands.

### 2. Notification System
- **Scheduler**: A background job runs every minute to check active watches.
- **Alerts**: If an item's day change exceeds your threshold, the bot sends you a Direct Message (DM).
- **Cooldown**: To prevent spam, notifications for the same item are rate-limited to once per hour.
- **Database Integration**: Watch settings and user preferences are stored in the shared SQLite database.

## Setup & Testing

### Prerequisites
1. **Discord Bot Token**: You need a bot token from the [Discord Developer Portal](https://discord.com/developers/applications).
2. **Client ID**: You also need the Application (Client) ID for slash command registration.
3. **Invite Bot**: Invite the bot to your server (or just DM it if you enable the intent). Currently, it responds to interactions anywhere.

### Environment Variables
Updated `.env` requirements (add these to your root `.env`):
```
DISCORD_BOT_TOKEN=your_actual_bot_token_here
DISCORD_CLIENT_ID=your_client_id_here
```

### Running the Bot
1. Open a new terminal.
2. Navigate to `packages/discord-bot`.
3. Run `npm run dev` (or `npm start` for production).
4. The bot should log "Logged in as..." and "Successfully reloaded application (/) commands.".

### Verifying
1. Go to Discord.
2. Type `/help` to see if commands are registered.
3. Try `/watch item_id:2` (Cannonball) or any valid ID.
4. Try `/listwatches`.
5. Wait for price updates (needs the Backend running to fetch prices!).

## Files Created/Modified

- `packages/discord-bot/src/index.ts`: Main bot logic and command handlers.
- `packages/discord-bot/src/database.ts`: Database access for watches/users.
- `packages/discord-bot/src/scheduler.ts`: Notification checking logic.
- `packages/discord-bot/package.json`: Added `dotenv`, `better-sqlite3`, `node-cron`.
