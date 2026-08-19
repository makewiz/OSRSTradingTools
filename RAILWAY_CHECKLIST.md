# Railway Deployment Checklist

Use this checklist to ensure you complete all steps for deploying to Railway.

## Pre-Deployment ✅

- [ ] Code is committed and pushed to GitHub
- [ ] `.env` files are NOT committed (they're in `.gitignore`)
- [ ] All services work locally (backend, frontend, Discord bot)
- [ ] PostgreSQL database is working locally
- [ ] Discord application is configured at https://discord.com/developers/applications

## Discord Application Setup ✅

- [ ] Discord application created
- [ ] Bot token generated and saved
- [ ] OAuth2 redirect URI configured (will update after deploying frontend)
- [ ] Bot invited to your Discord server
- [ ] Required bot permissions granted (Send Messages, Read Messages, etc.)

## Railway Account Setup ✅

- [ ] Railway account created at https://railway.app
- [ ] GitHub connected to Railway
- [ ] Repository access granted to Railway

## Database Deployment ✅

- [ ] PostgreSQL service added to Railway project
- [ ] `DATABASE_URL` environment variable auto-generated
- [ ] Database is in "Running" state

## Backend Deployment ✅

- [ ] Backend service created from GitHub repo
- [ ] Root directory set to `packages/backend`
- [ ] Build command: `npm install && npm run build`
- [ ] Start command: `npm start`
- [ ] Public domain generated
- [ ] Environment variables configured:
  - [ ] `DATABASE_URL=${{Postgres.DATABASE_URL}}`
  - [ ] `JWT_SECRET=<generated-secret>` (run `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
  - [ ] `PORT=4000`
  - [ ] `GEMINI_API_KEY=<your-gemini-api-key>` (optional, for AI features)
  - [ ] `GEMINI_MODEL=gemini-3.5-flash-lite` (optional)
  - [ ] `DISCORD_CLIENT_ID=<your-value>` (optional, for Discord OAuth)
  - [ ] `DISCORD_CLIENT_SECRET=<your-value>` (optional, for Discord OAuth)
  - [ ] `DISCORD_REDIRECT_URI=<frontend-url>/auth/discord/callback` (update after frontend deployed)
  - [ ] `BOT_API_KEY=<secure-random-key>` (optional, only if deploying bot)
- [ ] Service deployed successfully
- [ ] No errors in deployment logs
- [ ] Backend URL saved: `https://_________________________________.railway.app`

## Discord Bot Deployment ✅

- [ ] Discord bot service created from GitHub repo
- [ ] Root directory set to `packages/discord-bot`
- [ ] Build command: `npm install && npm run build`
- [ ] Start command: `npm start`
- [ ] NO public domain generated (bot doesn't need one)
- [ ] Environment variables configured:
  - [ ] `DATABASE_URL=${{Postgres.DATABASE_URL}}`
  - [ ] `DISCORD_BOT_TOKEN=<your-bot-token>`
  - [ ] `DISCORD_CLIENT_ID=<your-client-id>`
  - [ ] `BOT_API_KEY=<must-match-backend-key>`
  - [ ] `BACKEND_URL=http://<backend-service-name>.railway.internal:4000`
- [ ] Service deployed successfully
- [ ] Bot shows as online in Discord
- [ ] No errors in deployment logs

## Frontend Deployment ✅

- [ ] Frontend service created from GitHub repo
- [ ] Root directory set to `packages/frontend`
- [ ] Build command: `npm install && npm run build`
- [ ] Start command: `npx vite preview --port $PORT --host 0.0.0.0`
- [ ] Public domain generated
- [ ] Environment variables configured (optional, if using absolute API URLs):
  - [ ] `VITE_API_URL=<backend-url>`
- [ ] Service deployed successfully
- [ ] No errors in deployment logs
- [ ] Frontend accessible in browser
- [ ] Frontend URL saved: `https://_________________________________.railway.app`

## Post-Deployment Configuration ✅

- [ ] Backend `DISCORD_REDIRECT_URI` updated with actual frontend URL
- [ ] Backend service redeployed with updated environment variable
- [ ] Discord application OAuth2 redirect URI updated to match frontend URL
- [ ] Discord application settings saved

## Database Initialization ✅

- [ ] Database tables created (either via migration script or auto-initialization)
- [ ] Database schema verified
- [ ] Sample data added (if needed)

## Testing ✅

### Frontend Testing
- [ ] Frontend loads without errors
- [ ] UI displays correctly
- [ ] Navigation works

### Authentication Testing
- [ ] Discord login button appears
- [ ] Clicking login redirects to Discord
- [ ] Can authorize application
- [ ] Redirected back to frontend after authorization
- [ ] User is logged in successfully
- [ ] User data stored in database

### Backend API Testing
- [ ] API endpoints respond correctly
- [ ] Database queries work
- [ ] Authentication middleware works
- [ ] CORS allows frontend requests

### Discord Bot Testing
- [ ] Bot shows as online in Discord server
- [ ] Bot responds to commands
- [ ] Bot can access database
- [ ] Scheduled tasks work (if applicable)

### Integration Testing
- [ ] Create a watch via frontend
- [ ] Watch appears in database
- [ ] Bot can read watches from database
- [ ] Notifications work end-to-end

## Monitoring & Optimization ✅

- [ ] All services show "Active" in Railway dashboard
- [ ] No errors in any service logs
- [ ] Database connections stable
- [ ] Response times acceptable
- [ ] Railway usage monitored (check $5 free credit status)

## Documentation ✅

- [ ] Deployment URLs documented
- [ ] Environment variables documented (but secrets NOT committed)
- [ ] Team members have access to Railway project (if applicable)
- [ ] Update README.md with production URL

## Optional Enhancements 🎯

- [ ] Custom domain configured
- [ ] SSL certificate verified (Railway provides this automatically)
- [ ] Error monitoring service integrated (e.g., Sentry)
- [ ] Staging environment created
- [ ] CI/CD pipeline configured
- [ ] Database backups configured (Railway does automatic backups)
- [ ] Rate limiting configured for API
- [ ] Logging service integrated

## Troubleshooting Quick Reference 🔧

### Service Won't Start
1. Check deployment logs for build errors
2. Verify all environment variables are set
3. Ensure package.json scripts are correct
4. Check Railway service status page

### Database Connection Error
1. Verify `DATABASE_URL` is set correctly
2. Check PostgreSQL service is running
3. Review database connection code
4. Check for connection pool issues

### Discord OAuth Not Working
1. Verify redirect URI matches exactly
2. Check Discord app settings
3. Ensure client ID and secret are correct
4. Check browser console for errors

### Frontend Can't Reach Backend
1. Check backend public domain is accessible
2. Verify CORS settings in backend
3. Update `VITE_API_URL` if using environment variables
4. Check network tab in browser DevTools

---

## Deployment Complete! 🎉

Once all items are checked off:

✅ Your application is live on Railway  
✅ All services are running and connected  
✅ Users can access your application  

**Next Steps:**
- Monitor your Railway dashboard regularly
- Watch for any unusual activity or errors
- Plan for scaling as your user base grows
- Consider setting up alerts for downtime

**Need Help?**
- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Your deployment guide: `.agent/workflows/deploy-to-railway.md`

---

**Deployment Date:** _________________  
**Deployed By:** _________________  
**Frontend URL:** _________________  
**Backend URL:** _________________
