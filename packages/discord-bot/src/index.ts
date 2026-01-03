import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } from "discord.js";
import dotenv from "dotenv";
import path from "path";
import { addWatch, removeWatch, getWatches, setNotificationsEnabled, closeDatabase } from "./database";
import { startNotificationScheduler } from "./scheduler";

// Load environment variables from backend .env for simplicity in this setup, 
// or from local .env if it exists. 
// Assuming run from package root.
dotenv.config({ path: path.join(__dirname, "../../../.env") });
// Also try local .env
dotenv.config();

const TOKEN = process.env.DISCORD_BOT_TOKEN;
const CLIENT_ID = process.env.DISCORD_CLIENT_ID; // Need this for slash commands

if (!TOKEN) {
  // eslint-disable-next-line no-console
  console.error("Missing DISCORD_BOT_TOKEN");
  process.exit(1);
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.DirectMessages],
});

// Define Commands
const commands = [
  new SlashCommandBuilder()
    .setName("watch")
    .setDescription("Watch an item for price changes")
    .addIntegerOption(option =>
      option.setName("item_id")
        .setDescription("The OSRS Item ID")
        .setRequired(true))
    .addNumberOption(option =>
      option.setName("threshold")
        .setDescription("Day change percentage threshold (e.g. 5 for 5%)")
        .setRequired(false)),
  new SlashCommandBuilder()
    .setName("unwatch")
    .setDescription("Stop watching an item")
    .addIntegerOption(option =>
      option.setName("item_id")
        .setDescription("The OSRS Item ID")
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName("listwatches")
    .setDescription("List your active watches"),
  new SlashCommandBuilder()
    .setName("notifications")
    .setDescription("Toggle notifications on/off")
    .addBooleanOption(option =>
      option.setName("enabled")
        .setDescription("Enable or disable notifications")
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("Show available commands"),
].map(command => command.toJSON());

// Register Commands
async function registerCommands() {
  if (!CLIENT_ID) {
    // eslint-disable-next-line no-console
    console.warn("DISCORD_CLIENT_ID not set. Skipping slash command registration.");
    return;
  }
  const rest = new REST({ version: "10" }).setToken(TOKEN!);
  try {
    // eslint-disable-next-line no-console
    console.log("Started refreshing application (/) commands.");
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    // eslint-disable-next-line no-console
    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);
  }
}

client.once("ready", () => {
  // eslint-disable-next-line no-console
  console.log(`Logged in as ${client.user?.tag}!`);
  registerCommands();
  startNotificationScheduler(client);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  const discordId = interaction.user.id;

  try {
    if (commandName === "watch") {
      const itemId = interaction.options.getInteger("item_id", true);
      const threshold = interaction.options.getNumber("threshold") ?? 5.0;

      // Used default item name for now, in a real app we'd fetch the name to confirm
      addWatch(discordId, itemId, threshold);
      await interaction.reply({ content: `✅ Watching item ${itemId} with threshold ${threshold}%`, ephemeral: true });

    } else if (commandName === "unwatch") {
      const itemId = interaction.options.getInteger("item_id", true);
      removeWatch(discordId, itemId);
      await interaction.reply({ content: `❌ Stopped watching item ${itemId}`, ephemeral: true });

    } else if (commandName === "listwatches") {
      const watches = getWatches(discordId);
      if (watches.length === 0) {
        await interaction.reply({ content: "You have no active watches.", ephemeral: true });
      } else {
        const list = watches.map(w => `- Item ${w.item_id} (Threshold: ${w.day_change_threshold}%)`).join("\n");
        await interaction.reply({ content: `👀 **Your Watches**:\n${list}`, ephemeral: true });
      }

    } else if (commandName === "notifications") {
      const enabled = interaction.options.getBoolean("enabled", true);
      setNotificationsEnabled(discordId, enabled);
      await interaction.reply({ content: enabled ? "🔔 Notifications enabled" : "🔕 Notifications disabled", ephemeral: true });

    } else if (commandName === "help") {
      const helpText = `
**OSRS Trading Tools Bot Commands**
\`/watch <id> [threshold]\` - Watch item by ID
\`/unwatch <id>\` - Stop watching item
\`/listwatches\` - See your watches
\`/notifications <on/off>\` - Toggle global notifications
      `;
      await interaction.reply({ content: helpText, ephemeral: true });
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    await interaction.reply({ content: "An error occurred while executing the command.", ephemeral: true });
  }
});

// Graceful shutdown
process.on("SIGINT", () => {
  client.destroy();
  closeDatabase();
  process.exit(0);
});

client.login(TOKEN);
