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
- **Phase 1**: Database & Historical Data (SQLite, Scheduler, Aggregator)
- **Phase 2**: Enhanced Data (Day Change, Margin*Volume)
- **Phase 3**: Item Detail Page (Charts, History, Routing)
- **Phase 4**: Authentication System (Register/Login, User Favorites DB sync)
- **Phase 5**: Discord Bot Features (Commands, Notifications, Linking)
- **Phase 5.5**: Web-Discord Integration (Profile Page, UI Watch Toggles)
- **Phase 5.6**: Discord OAuth2 Integration (Login/Linking via Discord)

### ❌ Remaining Features
- **Phase 6**: AI Highlights & Trading Tools
- **Phase 7**: Integration & Polish

## Phase 1: Database & Historical Data (Foundation) - ✅ COMPLETED
... (Impl 1 details) ...

## Phase 2: Enhanced Data & Calculations - ✅ COMPLETED
... (Impl 2 details) ...

## Phase 3: Item Detail Page - ✅ COMPLETED
... (Impl 3 details) ...

## Phase 4: Authentication System - ✅ COMPLETED
... (Impl 4 details) ...

## Phase 5: Discord Bot Features - ✅ COMPLETED
... (Impl 5 details) ...

## Phase 5.5: Web-Discord Integration - ✅ COMPLETED
... (Impl 5.5 details) ...

## Phase 5.6: Discord OAuth2 Integration - ✅ COMPLETED

### 5.6.1 Backend OAuth
**Implementation**:
- Implement Discord OAuth2 flow (Code Grant)
- `POST /api/auth/discord/login`: Exchange code, find/create user, return JWT
- `POST /api/discord/link-oauth`: Exchange code, link Discord ID to authenticated user
- `GET /api/discord/config`: Public endpoint for Client ID

**Files created**:
- `packages/backend/src/oauth.ts`
- `packages/backend/src/routes/auth.ts` (updated)
- `packages/backend/src/routes/discord.ts` (updated)

### 5.6.2 Frontend OAuth
**Implementation**:
- **Callback Page**: Handles specific route `/auth/discord/callback`
- **Login Page**: "Login with Discord" button -> Redirects to Discord
- **Profile Page**: "Connect Discord" button -> Redirects to Discord

**Files created/modified**:
- `packages/frontend/src/pages/DiscordCallback.tsx`
- `packages/frontend/src/pages/Login.tsx`
- `packages/frontend/src/pages/Profile.tsx`
- `packages/frontend/src/App.tsx`

## Phase 6: AI Highlights & Trading Tools (Current Focus)

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

... (Phase 7 details) ...

## Dependencies to Install

... (Keep existing) ...

## Environment Variables Needed

### Backend `.env`
```
PORT=4000
DATABASE_PATH=./data/osrs_trading.db
JWT_SECRET=your_secret_key_here
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
DISCORD_REDIRECT_URI=http://localhost:5173/auth/discord/callback
```
