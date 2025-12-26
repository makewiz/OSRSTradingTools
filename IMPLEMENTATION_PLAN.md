# Implementation Plan for Remaining Features

This document outlines the plan to complete all remaining features from `ProjectInstructions.md`.

## Current Status

### ✅ Completed Features
- Basic item listing with search and sorting (name, buy, sell, margin, volume)
- Favorites functionality (localStorage)
- Responsive, mobile-friendly UI
- Item icons from OSRS wiki
- Basic backend API fetching OSRS prices
- Basic Discord bot skeleton
- README with setup instructions

### ❌ Remaining Features

## Phase 1: Database & Historical Data (Foundation)

### 1.1 Database Setup
**Tech Choice**: SQLite (free, simple, file-based, perfect for hobby project)

**Schema Design**:
```sql
-- Item price history (with time-based aggregation strategy)
item_price_history (
  id INTEGER PRIMARY KEY,
  item_id INTEGER NOT NULL,
  timestamp INTEGER NOT NULL, -- Unix timestamp
  buy_price INTEGER,
  sell_price INTEGER,
  volume INTEGER,
  granularity TEXT -- 'minute', 'hour', 'day'
)

-- Users table
users (
  id INTEGER PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email TEXT,
  created_at INTEGER
)

-- User favorites (migrate from localStorage)
user_favorites (
  user_id INTEGER,
  item_id INTEGER,
  PRIMARY KEY (user_id, item_id)
)

-- Discord user linkage
discord_users (
  discord_id TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  notifications_enabled BOOLEAN DEFAULT true,
  created_at INTEGER
)

-- Notification watch settings
notification_settings (
  id INTEGER PRIMARY KEY,
  discord_id TEXT REFERENCES discord_users(discord_id),
  item_id INTEGER,
  day_change_threshold REAL, -- percentage (e.g., 5.0 for 5%)
  enabled BOOLEAN DEFAULT true,
  created_at INTEGER
)
```

**Implementation**:
- Install `better-sqlite3` (fast, synchronous SQLite)
- Create migration scripts
- Add database initialization on backend startup
- Implement data retention: keep minute-level data for 24h, aggregate to hourly for 7 days, daily after that

### 1.2 Scheduled Price Fetcher
**Implementation**:
- Replace current cache-only system with database-backed storage
- Use `node-cron` or `setInterval` to fetch prices every minute
- Store each fetch with timestamp
- Implement aggregation job (runs daily) to compress old data
- Keep API endpoint fast by querying latest data + aggregated history

**Files to create/modify**:
- `packages/backend/src/database.ts` - Database setup and queries
- `packages/backend/src/scheduler.ts` - Cron job for price fetching
- `packages/backend/src/aggregator.ts` - Data compression logic

## Phase 2: Enhanced Data & Calculations

### 2.1 Day Change Calculation
**Implementation**:
- Query database for price 24 hours ago
- Calculate percentage change: `((current - old) / old) * 100`
- Add `dayChange` field to API response
- Handle cases where historical data doesn't exist yet

**Files to modify**:
- `packages/backend/src/osrsClient.ts` - Add day change calculation
- `packages/backend/src/index.ts` - Include in API response

### 2.2 Price Change & Margin*Volume Columns
**Implementation**:
- Add `dayChange` and `marginVolume` (margin * volume) to frontend
- Add sorting/filtering for these columns
- Update `SortKey` type to include new options

**Files to modify**:
- `packages/frontend/src/App.tsx` - Add columns and sorting logic

## Phase 3: Item Detail Page

### 3.1 Item Detail Route & Page
**Implementation**:
- Create `/item/:id` route in frontend
- Fetch item details + price history from backend
- Use `recharts` or `chart.js` for price graph (buy/sell over time)
- Display: current prices, day change, volume, margin, historical chart, wiki link

**Backend API**:
- `GET /api/items/:id` - Single item details
- `GET /api/items/:id/history` - Price history (with time range query params)

**Files to create**:
- `packages/frontend/src/ItemDetail.tsx`
- `packages/frontend/src/PriceChart.tsx`
- `packages/backend/src/routes/items.ts` - Item-specific routes

## Phase 4: Authentication System

### 4.1 Backend Authentication
**Implementation**:
- Install `bcrypt` for password hashing
- Install `jsonwebtoken` for JWT tokens
- Create `/api/auth/register` endpoint
- Create `/api/auth/login` endpoint
- Create `/api/auth/me` endpoint (get current user)
- Add middleware to protect routes requiring auth
- Migrate favorites to database (user-specific)

**Files to create**:
- `packages/backend/src/auth.ts` - Auth utilities and middleware
- `packages/backend/src/routes/auth.ts` - Auth endpoints

### 4.2 Frontend Authentication
**Implementation**:
- Create login/register pages
- Add React Router for navigation
- Create auth context/provider
- Store JWT in localStorage
- Protect routes (redirect to login if not authenticated)
- Update favorites to sync with backend

**Files to create**:
- `packages/frontend/src/pages/Login.tsx`
- `packages/frontend/src/pages/Register.tsx`
- `packages/frontend/src/contexts/AuthContext.tsx`
- `packages/frontend/src/components/ProtectedRoute.tsx`

## Phase 5: Discord Bot Features

### 5.1 Discord Bot Commands
**Commands to implement**:
- `/watch <item_id> [threshold]` - Add item to watch list with optional day change threshold (default 5%)
- `/unwatch <item_id>` - Remove item from watch list
- `/list-watches` - Show all watched items with thresholds
- `/notifications on|off` - Enable/disable all notifications
- `/help` - Show command list

**Implementation**:
- Use Discord.js slash commands or message-based commands
- Store watch settings in database
- Link Discord user to app user (optional, or standalone Discord users)

**Files to modify**:
- `packages/discord-bot/src/index.ts` - Add command handlers
- `packages/discord-bot/src/commands/` - Command modules

### 5.2 Private Message Notification System
**Implementation**:
- Create notification checker service (runs every minute)
- Query database for all active watch settings
- Calculate day change for each watched item
- Send PM if threshold exceeded
- Rate limiting: max 1 notification per item per hour per user
- Batch multiple alerts into single message when possible

**Files to create**:
- `packages/discord-bot/src/notifier.ts` - Notification logic
- `packages/discord-bot/src/scheduler.ts` - Cron for checking notifications

### 5.3 Notification Throttling Logic
**Implementation**:
- Track `last_notified_at` per item per user
- Batch multiple alerts: "3 items exceeded thresholds: Item A (+8%), Item B (-6%), Item C (+12%)"
- Prioritize high-margin items
- Respect user's notification preferences
- Add cooldown periods

**Files to modify**:
- `packages/discord-bot/src/notifier.ts` - Add throttling logic

## Phase 6: AI Highlights & Trading Tools

### 6.1 AI Highlights Service
**Tech Choice**: Use OpenAI API or similar (via environment variable, not hardcoded)

**Implementation**:
- Analyze market data for patterns:
  - High margin + high volume items
  - Sudden price spikes/drops
  - Low-volume opportunities
  - Trending items
- Generate concise summaries (2-3 sentences)
- Store highlights in database with timestamp
- Run analysis daily or on-demand

**Files to create**:
- `packages/backend/src/ai/highlights.ts` - AI analysis logic
- `packages/backend/src/routes/highlights.ts` - Highlights API endpoint

### 6.2 AI Highlights Integration
**Implementation**:
- Display highlights on website dashboard/homepage
- Discord bot sends daily/weekly highlights to subscribed users
- Add opt-in checkbox for highlights notifications

**Files to modify**:
- `packages/frontend/src/App.tsx` - Add highlights section
- `packages/discord-bot/src/index.ts` - Add highlights command/scheduler

### 6.3 Trading Tools & Analysis
**Calculations to add**:
- ROI (Return on Investment) percentage
- Profit per hour estimates (based on volume and margin)
- Risk scores (volatility, volume stability)
- Market trends (7-day, 30-day trends)
- Margin*Volume score (already calculated, add to UI)

**Implementation**:
- Add calculations to backend API
- Display on item detail page
- Add filters/sorting for these metrics

**Files to modify**:
- `packages/backend/src/osrsClient.ts` - Add calculation functions
- `packages/frontend/src/ItemDetail.tsx` - Display trading metrics

## Phase 7: Integration & Polish

### 7.1 Backend-Discord Integration
**Implementation**:
- Discord bot queries backend API or shared database
- Coordinate price fetching (backend fetches, bot reads)
- Shared types/interfaces between packages

**Files to create**:
- `packages/shared/` - Shared types and utilities (optional)
- Or: Discord bot uses backend API endpoints

### 7.2 Testing & Documentation
**Implementation**:
- Add example `.env` files (`.env.example`)
- Update README with database setup instructions
- Document all API endpoints
- Add error handling and logging

## Implementation Order Recommendation

1. **Phase 1** (Database & Scheduled Fetching) - Foundation for everything else
2. **Phase 2** (Day Change & Enhanced Columns) - Quick wins, improves existing features
3. **Phase 4** (Authentication) - Needed before user-specific features
4. **Phase 3** (Item Detail Page) - Enhances user experience
5. **Phase 5** (Discord Bot Features) - Core Discord functionality
6. **Phase 6** (AI & Trading Tools) - Advanced features
7. **Phase 7** (Integration & Polish) - Final touches

## Dependencies to Install

### Backend
```bash
npm install better-sqlite3 node-cron bcrypt jsonwebtoken
npm install -D @types/better-sqlite3 @types/bcrypt @types/jsonwebtoken @types/node-cron
```

### Frontend
```bash
npm install react-router-dom recharts
npm install -D @types/react-router-dom
```

### Discord Bot
```bash
npm install dotenv
# (discord.js already installed)
```

## Environment Variables Needed

### Backend `.env`
```
PORT=4000
DATABASE_PATH=./data/osrs_trading.db
JWT_SECRET=your_secret_key_here
```

### Discord Bot `.env`
```
DISCORD_BOT_TOKEN=your_token_here
BACKEND_API_URL=http://localhost:4000
```

### Optional: AI Service `.env`
```
OPENAI_API_KEY=your_key_here  # Or other AI service
```

## Notes

- **Database Growth**: The aggregation strategy (minute → hour → day) should keep database size manageable. Monitor and adjust retention policies as needed.
- **Rate Limiting**: Discord API has rate limits. Implement queuing/backoff for PM sending.
- **Error Handling**: Add comprehensive error handling and logging throughout.
- **Security**: Always hash passwords, validate inputs, use HTTPS in production, sanitize database queries.



