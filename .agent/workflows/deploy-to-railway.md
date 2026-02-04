---
description: Deploy the application to Railway
---

# Deploy OSRS Trading Tools to Railway

This guide walks you through deploying your application (frontend, backend, Discord bot, and PostgreSQL database) to Railway.

## Prerequisites

- [ ] GitHub account with your code pushed to a repository
- [ ] Railway account (sign up at https://railway.com?referralCode=HI3d1h)
- [ ] Discord application credentials (Client ID, Client Secret, Bot Token)

---

## Part 1: Initial Railway Setup

### 1. Sign up for Railway

1. Go to https://railway.com?referralCode=HI3d1h
2. Click "Login" and authenticate with GitHub
3. Grant Railway access to your repositories

### 2. Create a New Project

1. From Railway dashboard, click "New Project"
2. Select "Deploy from GitHub repo"
3. Choose your `OSRSTradingTools` repository
4. Railway will create a project

---

## Part 2: Add PostgreSQL Database

### 1. Add Database Service

1. In your Railway project, click "+ New"
2. Select "Database" → "Add PostgreSQL"
3. Railway will provision a PostgreSQL database
4. The database will automatically get a `DATABASE_URL` environment variable

### 2. Note the Database Connection

- Railway automatically creates the `DATABASE_URL` variable
- This variable is available to all services in your project
- No manual configuration needed!

---

## Part 3: Deploy Backend Service

### 1. Create Backend Service

1. In your project, click "+ New"
2. Select "GitHub Repo" → Choose your repository
3. Railway will detect it's a monorepo

### 2. Configure Backend Settings

1. Click on the service → "Settings"
2. Set **Root Directory**: `/` (leave empty or set to root)
3. Set **Build Command**: `npm install && npm run build:backend`
4. Set **Start Command**: `npm start --workspace backend`
5. Under "Networking", click "Generate Domain" (this gives you a public URL)

### 3. Add Environment Variables

In the service's "Variables" tab, add:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=your-super-secret-jwt-key-change-this
DISCORD_CLIENT_ID=your-discord-client-id
DISCORD_CLIENT_SECRET=your-discord-client-secret
DISCORD_REDIRECT_URI=https://your-frontend-domain.railway.app/auth/discord/callback
BOT_API_KEY=your-secure-random-api-key
PORT=4000
```

**Important Notes:**
- `DATABASE_URL` references the PostgreSQL service automatically
- Generate a strong random `JWT_SECRET` (use: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- Generate a strong random `BOT_API_KEY` and keep it safe (you'll need it for the bot service)
- Get Discord credentials from https://discord.com/developers/applications
- Update `DISCORD_REDIRECT_URI` once you have your frontend URL

### 4. Deploy

- Railway will automatically build and deploy
- Check the "Deployments" tab for build logs
- Once deployed, note the backend URL (e.g., `https://backend-production-xxxx.up.railway.app`)

---

## Part 4: Deploy Discord Bot

### 1. Create Bot Service

1. Click "+ New" → "GitHub Repo" → Choose your repository
2. Railway detects the monorepo again

### 2. Configure Bot Settings

1. Click on the service → "Settings"
2. Set **Root Directory**: `/` (leave empty or set to root)
3. Set **Build Command**: `npm install && npm run build:bot`
4. Set **Start Command**: `npm start --workspace discord-bot`
5. **Do NOT** generate a domain (the bot doesn't need a public URL)

### 3. Add Environment Variables

In the service's "Variables" tab, add:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
DISCORD_BOT_TOKEN=your-discord-bot-token
DISCORD_CLIENT_ID=your-discord-client-id
BOT_API_KEY=your-secure-random-api-key
BACKEND_URL=http://${{Backend.RAILWAY_PRIVATE_DOMAIN}}:${{Backend.PORT}}
```

**Notes:**
- Get `DISCORD_BOT_TOKEN` from Discord Developer Portal
- `BOT_API_KEY` must match the one set in the Backend service
- `BACKEND_URL`: Use the private network URL to avoid egress fees.
  - Format: `http://<service-name>.railway.internal:<port>` (e.g., `http://backend.railway.internal:4000` if your service is named "backend")
  - You can check your service name in Railway settings.
- The bot service will run as a background process

### 4. Deploy

- Railway will build and start the bot
- Check logs to confirm the bot connected to Discord

---

## Part 5: Deploy Frontend

### 1. Create Frontend Service

1. Click "+ New" → "GitHub Repo" → Choose your repository

### 2. Configure Frontend Settings

1. Click on the service → "Settings"
2. Set **Root Directory**: `/` (leave empty or set to root)
3. Set **Build Command**: `npm install && npm run build:frontend`
4. Set **Start Command**: `npm start --workspace frontend`
5. Under "Networking", click "Generate Domain"

### 3. Update Vite Config for Production

You need to update `packages/frontend/vite.config.ts` to handle API requests in production:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:4000"
    }
  },
  preview: {
    port: 5173,
    host: "0.0.0.0"
  }
});
```

### 4. Add Environment Variables

In the service's "Variables" tab, add:

```
VITE_API_URL=https://your-backend-domain.up.railway.app
```

**Note:** Update this with your actual backend URL from Part 3

### 5. Update Frontend API Calls

Update your frontend code to use the environment variable for API calls. If you're using relative paths like `/api/...`, you'll need to update them to use `import.meta.env.VITE_API_URL + '/api/...'` or configure a reverse proxy.

**Alternatively**, you can configure the frontend to use a relative path and include the backend URL in the build process.

### 6. Deploy

- Railway will build and serve your frontend
- Access your app at the generated domain!

---

## Part 6: Configure Discord OAuth Redirect

### 1. Update Discord Application Settings

1. Go to https://discord.com/developers/applications
2. Select your application
3. Go to "OAuth2" → "Redirects"
4. Add your frontend URL: `https://your-frontend-domain.railway.app/auth/discord/callback
5. Save changes

### 2. Update Backend Environment Variable

1. Go to your backend service in Railway
2. Update `DISCORD_REDIRECT_URI` to match the URL above
3. The service will automatically redeploy

---

## Part 7: Database Migration

### 1. Initialize Database Schema

Your database needs tables created. You have two options:

**Option A: Run migration locally against Railway database**

1. In Railway, click on your PostgreSQL service
2. Go to "Connect" tab and copy the `DATABASE_URL`
3. On your local machine:
```bash
# Set the Railway database URL temporarily
$env:DATABASE_URL="postgresql://user:pass@host:port/dbname"

# Run your backend (it should create tables on startup if you have that logic)
cd packages/backend
npm run dev
```

**Option B: Add initialization to your backend code**

Ensure your `database.ts` or startup code creates tables if they don't exist. This way tables are created automatically on first deploy.

---

## Part 8: Verify Deployment

### 1. Check All Services

In Railway dashboard, verify all services show "Active":
- ✅ PostgreSQL (Running)
- ✅ Backend (Active, with public URL)
- ✅ Discord Bot (Active, no URL needed)
- ✅ Frontend (Active, with public URL)

### 2. Test the Application

1. Visit your frontend URL
2. Try Discord login
3. Check that data persists (use the database)
4. Test Discord bot commands

### 3. Monitor Logs

- Click on each service to view logs
- Check for errors or warnings
- Railway provides real-time log streaming

---

## Part 9: Set Up Auto-Deployment

Railway automatically deploys on every push to your main branch!

1. Push changes to GitHub
2. Railway detects the change
3. Affected services rebuild and redeploy
4. Check deployment status in Railway dashboard

**To disable auto-deploy:**
- Go to Service Settings → "Deploy triggers"
- Toggle off "Auto deploy"

---

## Part 10: Cost Management

### Monitor Usage

1. Go to Project Settings → "Usage"
2. Railway provides $5/month free credit
3. Monitor your spending to avoid surprises

### Optimize Costs

- Use Railway's free tier for development
- Scale down services if not needed 24/7
- Review pricing at https://railway.app/pricing

**Expected costs for this app:**
- PostgreSQL: ~$5/month
- Backend: ~$5/month
- Discord Bot: ~$5/month
- Frontend: ~$5/month
- **Total: ~$20/month** (minus $5 free credit = $15/month)

---

## Troubleshooting

### Service won't start

1. Check build logs for errors
2. Verify all environment variables are set
3. Ensure `package.json` has correct build/start scripts

### Database connection errors

1. Verify `DATABASE_URL` is set correctly in both backend and bot
2. Check PostgreSQL service is running
3. Review database connection code in `database.ts`

### Discord OAuth not working

1. Verify `DISCORD_REDIRECT_URI` matches your frontend URL exactly
2. Check Discord application has the correct redirect URL
3. Ensure `DISCORD_CLIENT_ID` and `DISCORD_CLIENT_SECRET` are correct

### Frontend can't reach backend

1. Verify backend has a public domain generated
2. Update `VITE_API_URL` environment variable in frontend
3. Check CORS settings in your backend allow requests from frontend domain

---

## Additional Configuration

### Custom Domain (Optional)

1. Purchase a domain (e.g., from Namecheap, Google Domains)
2. In Railway, go to service → Settings → Networking
3. Click "Custom Domain" and follow instructions
4. Update DNS records at your domain provider
5. Update Discord OAuth redirect URLs to use custom domain

### Environment Management

Railway supports multiple environments:
1. Create separate projects for staging/production
2. Use different database instances
3. Manage environment variables per project

---

## Quick Reference: Environment Variables

### Backend
```
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=<random-secret>
DISCORD_CLIENT_ID=<discord-app-client-id>
DISCORD_CLIENT_SECRET=<discord-app-client-secret>
DISCORD_REDIRECT_URI=https://<frontend-domain>/auth/callback
BOT_API_KEY=<random-api-key>
PORT=4000
```

### Discord Bot
```
DATABASE_URL=${{Postgres.DATABASE_URL}}
DISCORD_BOT_TOKEN=<discord-bot-token>
DISCORD_CLIENT_ID=<discord-app-client-id>
BOT_API_KEY=<random-api-key>
BACKEND_URL=http://<backend-service-name>.railway.internal:4000
```

### Frontend
```
VITE_API_URL=https://<backend-domain>
```

---

## Next Steps After Deployment

1. ✅ Set up monitoring and alerts
2. ✅ Configure database backups (Railway does this automatically)
3. ✅ Add custom domain (optional)
4. ✅ Set up staging environment (optional)
5. ✅ Configure error tracking (e.g., Sentry)
6. ✅ Document your deployment process

---

**Need help?** Check Railway's documentation at https://docs.railway.app or join their Discord community.