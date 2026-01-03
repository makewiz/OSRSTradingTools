# Walkthrough: Discord Bot & Web Integration (Phase 5 & 5.6)

I have successfully implemented the Discord Bot features and integrated them into the Web UI.

## Features Implemented

### 1. Slash Commands
The bot now supports the following slash commands:
- `/watch <item_id> [threshold]`: Watch an item. Warns if the day change (24h%) exceeds the threshold (default 5%).
- `/unwatch <item_id>`: Stop watching an item.
- `/listwatches`: Shows your currently active watches.
- `/notifications <on|off>`: Globally toggle notifications for your user.
- `/help`: Show available commands.

### 2. Web Integration (New!)
You can now manage Discord notifications directly from the dashboard:
- **Profile Page**:
  - **Link Account**: Use the "Connect Discord" button to link your account securely via OAuth2.
  - **Global Toggle**: Enable/Disable notifications with a simple checkbox.
  - **Manage Watches**: View and remove active watches.
- **Login Page**:
  - **Login with Discord**: You can now log in or register directly using your Discord account.
- **Item Lists**:
  - **Watch Button**: A Bell icon (🔕/🔔) now appears next to items.
  - One-click to toggle watch (defaults to 5% threshold).
  - Requires linking your Discord account first.

### 3. Notification System
- **Scheduler**: Checks active watches every minute.
- **Alerts**: Sends DMs if price change exceeds threshold.
- **Cooldown**: 1 notification per item per hour to prevent spam.

## Setup & Testing

### Prerequisites
1. **Discord Bot Token**: Needs to be in `.env`.
2. **Client ID & Secret**: NEW! You must add OAuth credentials to `packages/backend/.env`.
3. **Redirect URI**: You must add the callback URL to the Discord Developer Portal and `.env`.

### Environment Variables
**packages/backend/.env**:
```
PORT=4000
DATABASE_PATH=./data/osrs_trading.db
JWT_SECRET=your_jwt_secret
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_REDIRECT_URI=http://localhost:5173/auth/discord/callback
```

### Discord Developer Portal Setup
1. Go to your Application in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Go to **OAuth2**.
3. Under **Redirects**, add: `http://localhost:5173/auth/discord/callback`
4. Copy your **Client Secret** and add it to your `.env`.

### How to use
1. **Login**: Click "Login with Discord" on the login page.
2. **Link**: Go to Profile and click "Connect Discord" to link your existing account.
3. **Watch**: Click the Bell icon on any item row.

## Files Created/Modified

- **OAuth**: `packages/backend/src/oauth.ts`, `packages/frontend/src/pages/DiscordCallback.tsx`
- **Backend Routes**: `packages/backend/src/routes/auth.ts`, `packages/backend/src/routes/discord.ts`
- **Frontend Pages**: `Login.tsx`, `Profile.tsx` (Added OAuth buttons)
