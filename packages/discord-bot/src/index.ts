import { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from "discord.js";
import dotenv from "dotenv";
import path from "path";
import { addWatch, removeWatch, getWatches, setNotificationsEnabled, setSystemSetting, closeDatabase } from "./database";
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
        .setRequired(false))
    .addStringOption(option =>
      option.setName("period")
        .setDescription("Time period to watch (1h or 24h)")
        .setRequired(false)
        .addChoices(
          { name: '1 Hour', value: '1h' },
          { name: '24 Hours', value: '24h' }
        )),
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
  new SlashCommandBuilder()
    .setName("highlights")
    .setDescription("Get daily market highlights"),
  new SlashCommandBuilder()
    .setName("config")
    .setDescription("Configure bot settings")
    .addSubcommand(subcommand =>
      subcommand
        .setName("sleep")
        .setDescription("Set bot sleep hours")
        .addIntegerOption(option => option.setName("start").setDescription("Start hour (0-23 UTC)").setRequired(true))
        .addIntegerOption(option => option.setName("end").setDescription("End hour (0-23 UTC)").setRequired(true)))
    .addSubcommand(subcommand =>
      subcommand
        .setName("channel")
        .setDescription("Set highlights channel ID")
        .addStringOption(option => option.setName("id").setDescription("Channel ID").setRequired(true)))
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
      const period = (interaction.options.getString("period") as '1h' | '24h') ?? '1h';

      // Used default item name for now, in a real app we'd fetch the name to confirm
      await addWatch(discordId, itemId, threshold, period);
      await interaction.reply({ content: `✅ Watching item ${itemId} with threshold ${threshold}% (${period} change)`, ephemeral: true });

    } else if (commandName === "unwatch") {
      const itemId = interaction.options.getInteger("item_id", true);
      await removeWatch(discordId, itemId);
      await interaction.reply({ content: `❌ Stopped watching item ${itemId}`, ephemeral: true });

    } else if (commandName === "listwatches") {
      const watches = await getWatches(discordId);
      if (watches.length === 0) {
        await interaction.reply({ content: "You have no active watches.", ephemeral: true });
      } else {
        const list = watches.map(w => `- Item ${w.item_id} (Threshold: ${w.day_change_threshold}%)`).join("\n");
        await interaction.reply({ content: `👀 **Your Watches**:\n${list}`, ephemeral: true });
      }

    } else if (commandName === "notifications") {
      const enabled = interaction.options.getBoolean("enabled", true);
      await setNotificationsEnabled(discordId, enabled);
      await interaction.reply({ content: enabled ? "🔔 Notifications enabled" : "🔕 Notifications disabled", ephemeral: true });

    } else if (commandName === "help") {

      const helpText = `
**OSRS Trading Tools Bot Commands**
\`/watch <id> [threshold]\` - Watch item by ID
\`/unwatch <id>\` - Stop watching item
\`/listwatches\` - See your watches
\`/notifications <on/off>\` - Toggle global notifications
\`/highlights\` - Get daily market highlights
      `;
      await interaction.reply({ content: helpText, ephemeral: true });

    } else if (commandName === "highlights") {
      await interaction.deferReply(); // Fetch might take a moment
      try {
        const res = await fetch("http://localhost:4000/api/highlights");
        if (!res.ok) throw new Error("API Error");
        const data = await res.json();

        const embed = new EmbedBuilder()
          .setTitle("📊 Daily Market Analysis")
          .setDescription(data.summary || "No summary available.")
          .setColor(0x0099ff)
          .setTimestamp(data.timestamp)
          .addFields(
            { name: "💰 High Margin", value: data.highMargin.map((i: any) => `• **${i.name}**: ${i.reason}`).join("\n") || "None", inline: false },
            { name: "📈 Top Spikes", value: data.priceSpikes.map((i: any) => `• **${i.name}**: ${i.reason}`).join("\n") || "None", inline: true },
            { name: "📉 Top Drops", value: data.priceDrops.map((i: any) => `• **${i.name}**: ${i.reason}`).join("\n") || "None", inline: true }
          )
          .setFooter({ text: "OSRS Trading Tools AI" });

        await interaction.editReply({ embeds: [embed] });
      } catch (err) {
        console.error(err);
        await interaction.editReply({ content: "Failed to fetch highlights. Is the backend running?" });
      }
    } else if (commandName === "config") {
      if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator)) {
        await interaction.reply({ content: "You do not have permission to use this command.", ephemeral: true });
        return;
      }

      if (interaction.options.getSubcommand() === "sleep") {
        const start = interaction.options.getInteger("start", true);
        const end = interaction.options.getInteger("end", true);

        if (start < 0 || start > 23 || end < 0 || end > 23) {
          await interaction.reply({ content: "Hours must be between 0 and 23.", ephemeral: true });
          return;
        }

        await setSystemSetting("bot_sleep_start", start.toString());
        await setSystemSetting("bot_sleep_end", end.toString());

        await interaction.reply({ content: `✅ Bot sleep time set to ${start}:00 - ${end}:00`, ephemeral: true });
      } else if (interaction.options.getSubcommand() === "channel") {
        const channelId = interaction.options.getString("id", true);
        await setSystemSetting("discord_highlights_channel_id", channelId);
        await interaction.reply({ content: `✅ Highlights channel set to: ${channelId}`, ephemeral: true });
      }
    }
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(err);
    await interaction.reply({ content: "An error occurred while executing the command.", ephemeral: true });
  }
});

// Graceful shutdown
process.on("SIGINT", async () => {
  client.destroy();
  await closeDatabase();
  process.exit(0);
});

client.login(TOKEN);
