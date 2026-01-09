# Deployment Guide

This document provides quick reference for deploying OSRS Trading Tools.

## Quick Links

- **Full Railway Guide**: See [`.agent/workflows/deploy-to-railway.md`](.agent/workflows/deploy-to-railway.md)
- **Railway Dashboard**: https://railway.app
- **Discord Developer Portal**: https://discord.com/developers/applications

## Prerequisites

Before deploying, ensure you have:

1. ✅ GitHub repository with your code
2. ✅ Railway account (free tier available)
3. ✅ Discord application created with OAuth2 configured
4. ✅ All code committed and pushed to GitHub

## Environment Variables Checklist

Use this checklist to ensure all environment variables are configured:

### Backend Service
- [ ] `DATABASE_URL` (auto-configured by Railway)
- [ ] `JWT_SECRET` (generate with: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`)
- [ ] `DISCORD_CLIENT_ID`
- [ ] `DISCORD_CLIENT_SECRET`
- [ ] `DISCORD_REDIRECT_URI` (your frontend URL + `/auth/discord/callback`)
- [ ] `BOT_API_KEY` (secure random string, must match bot service)
- [ ] `PORT` (usually 4000)

### Discord Bot Service
- [ ] `DATABASE_URL` (auto-configured by Railway)
- [ ] `DISCORD_BOT_TOKEN`
- [ ] `DISCORD_CLIENT_ID`
- [ ] `BOT_API_KEY` (must match backend service)
- [ ] `BACKEND_URL` (use private networking URL, e.g. `http://backend.railway.internal:4000`)

### Frontend Service
- [ ] `VITE_API_URL` (your backend URL)

## Quick Start

1. **Run the workflow**: Type `/deploy-to-railway` to view the full guide
2. **Follow the steps** in the Railway workflow
3. **Test your deployment** once all services are active

## Common Issues

| Issue | Solution |
|-------|----------|
| Database connection fails | Verify `DATABASE_URL` is set in both backend and bot services |
| Discord OAuth not working | Ensure redirect URI matches exactly in Discord app settings |
| Frontend can't reach backend | Check CORS settings and `VITE_API_URL` environment variable |
| Service won't build | Review build logs and verify `package.json` scripts are correct |

## Service URLs

After deployment, save your URLs here for reference:

- **Frontend**: `https://_________________________________.railway.app`
- **Backend**: `https://_________________________________.railway.app`
- **Database**: (internal, no public URL)
- **Discord Bot**: (no public URL needed)

## Post-Deployment

After successful deployment:

1. ✅ Update Discord application OAuth redirect URLs
2. ✅ Test user registration and login
3. ✅ Verify Discord bot is online and responding
4. ✅ Test item watch notifications
5. ✅ Monitor Railway usage dashboard

## Support

- Railway Documentation: https://docs.railway.app
- Discord.js Documentation: https://discord.js.org
- Project Issues: Create an issue in your GitHub repository

---

**Ready to deploy?** Use the `/deploy-to-railway` workflow for detailed step-by-step instructions.
