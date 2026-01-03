# Phase 5.5: Web-Discord Integration

- [x] Update Implementation Plan with Phase 5.5 details <!-- id: 0 -->
- [x] Backend: Create `discord` routes <!-- id: 1 -->
    - [x] `POST /api/discord/link`: Link Discord ID to User <!-- id: 2 -->
    - [x] `GET /api/discord/settings`: Get current settings <!-- id: 3 -->
    - [x] `POST /api/discord/settings`: Update settings (enable/disable) <!-- id: 4 -->
    - [x] `POST /api/discord/watch`: Add watch item <!-- id: 5 -->
    - [x] `DELETE /api/discord/watch/:itemId`: Remove watch item <!-- id: 6 -->
- [x] Backend: Register new routes in `index.ts` <!-- id: 7 -->
- [x] Frontend: Create Profile Page <!-- id: 8 -->
    - [x] Add link in Header for authenticated users <!-- id: 9 -->
    - [x] Form to input Discord ID <!-- id: 10 -->
    - [x] Toggle for Global Notifications <!-- id: 11 -->
    - [x] List of currently watched items (from DB) <!-- id: 12 -->
- [x] Frontend: Add Watch Button (🔔) to Item List/Detail <!-- id: 13 -->
    - [x] Sync watch status with backend <!-- id: 14 -->
- [x] Verification <!-- id: 15 -->
    - [x] Test linking account <!-- id: 16 -->
    - [x] Test toggling notifications <!-- id: 17 -->
    - [x] Test adding/removing watches via UI <!-- id: 18 -->

# Phase 5.6: Discord OAuth2 Integration
- [x] Update Implementation Plan with Phase 5.6 details <!-- id: 19 -->
- [x] Backend: OAuth Implementation <!-- id: 20 -->
    - [x] `discordOAuth.ts`: Helper functions (exchange code, fetch user) <!-- id: 21 -->
    - [x] Update `auth.ts`: Add `POST /auth/discord/login` <!-- id: 22 -->
    - [x] Update `backend/src/routes/discord.ts`: Add `POST /discord/link-oauth` and `GET /config` <!-- id: 24 -->
- [x] Frontend: OAuth UI <!-- id: 25 -->
    - [x] `DiscordCallback.tsx`: Handle redirect, send code to backend <!-- id: 26 -->
    - [x] Update `Login.tsx`: Add "Login with Discord" button <!-- id: 27 -->
    - [x] Update `Profile.tsx`: Replace manual ID input with "Connect Discord" button <!-- id: 28 -->
    - [x] Update `App.tsx`: Add callback route <!-- id: 29 -->
- [x] Verification <!-- id: 30 -->
    - [x] Verify Builds (Backend/Frontend) <!-- id: 31 -->
