import { Client, GatewayIntentBits } from "discord.js";

const token = process.env.DISCORD_BOT_TOKEN;

if (!token) {
  // eslint-disable-next-line no-console
  console.warn("DISCORD_BOT_TOKEN not set; bot will not start.");
  process.exit(0);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages]
});

client.once("ready", () => {
  // eslint-disable-next-line no-console
  console.log(`Discord bot logged in as ${client.user?.tag}`);
});

client.login(token).catch((err) => {
  // eslint-disable-next-line no-console
  console.error("Failed to login Discord bot", err);
});


