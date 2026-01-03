# Walkthrough: Authentication System (Phase 4)

I have successfully implemented the Authentication System for OSRS Trading Tools.

## Features Implemented

### 1. Backend Authentication
- **User Management**: Users can now register and login.
- **Security**: Passwords are securely hashed using `bcrypt` before storage in the SQLite database.
- **Tokens**: JSON Web Tokens (JWT) are issued upon login for stateless authentication.
- **Middleware**: Protected routes (like favorites management) are secured with an `authenticateToken` middleware.

### 2. Frontend Authentication
- **Login & Register Pages**: New pages for user onboarding.
- **Auth Context**: Global state management for user sessions, handling token storage in `localStorage`.
- **Protected Routes**: Redirects unauthenticated users to the login page when accessing restricted areas (extensible for future features).
- **Header Navigation**: Dynamic header showing specific links based on login status.

### 3. Favorites Synchronization
- **Database Storage**: Favorites are now stored in the database (`user_favorites` table).
- **Sync Logic**: 
  - When logged in, adding/removing favorites updates the server database.
  - When logged out, it falls back to `localStorage` so guests can still use the feature.
  - On login, the app fetches the user's persisted favorites.

## How to Test

1. **Start the Application**:
   Ensure both backend and frontend are running.

2. **Register a New Account**:
   - Click "Register" in the header.
   - Enter a username (min 3 chars) and password (min 6 chars).
   - Click "Register". You will be automatically logged in.

3. **Login**:
   - Logout (if logged in).
   - Click "Login".
   - Enter your credentials.

4. **Test Favorites**:
   - **As Guest**: Click the heart icon on an item. Reload the page. It should persist (localStorage).
   - **As User**: Login. Click the heart icon on an item. Reload the page. It should persist (Database).
   - **Sync Check**: Open the app in a different browser/incognito window key. Login with the same account. Your favorites should appear!

## Files Created/Modified

- `packages/backend/src/auth.ts`: Auth logic.
- `packages/backend/src/database.ts`: User & Favorites table logic.
- `packages/backend/src/routes/auth.ts`: Auth endpoints.
- `packages/backend/src/routes/favorites.ts`: Favorites endpoints.
- `packages/backend/src/index.ts`: Route registration.
- `packages/frontend/src/contexts/AuthContext.tsx`: React Context.
- `packages/frontend/src/pages/Login.tsx` & `Register.tsx`: Pages.
- `packages/frontend/src/components/Header.tsx`: Navigation.
- `packages/frontend/src/App.tsx`: Routing wiring.
- `packages/frontend/src/pages/ItemList.tsx`: Refactored list with sync logic.
