const {
  Client,
  GatewayIntentBits,
  Partials,
  ChannelType,
  PermissionsBitField,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  Events
} = require("discord.js");

/* ================= CONFIG ================= */

const OWNER_ID = "764913672681160736"; // your Discord ID

// Custom ticket emoji <:admin:1450357775681978393>
const TICKET_EMOJI = {
  name: "admin",
  id: "1450357775681978393"
};

let PANEL_MESSAGE_ID = null;
let LOG_CHANNEL_ID = null;
let ticketCount = 0;
let ticketRoles = new Set();

// channelId -> { ownerId, claimed }
const tickets = new Map();

/* ========================================= */

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

/* ================= READY ================= */

client.once(Events.ClientReady, async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder()
      .setName("setup")
      .setDescription("Create ticket panel"),

    new SlashCommandBuilder()
      .setName("ticket-role")
      .setDescription("Manage ticket access roles")
      .addSubcommand(s =>
        s.setName("add")
          .setDescription("Add role")
          .addRoleOption(o => o.setName("role").setDescription("Role to add").setRequired(true))
      )
      .addSubcommand(s =>
        s.setName("remove")
          .setDescription("Remove role")
          .addRoleOption(o => o.setName("role").setDescription("Role to remove").setRequired(true))
      )
      .addSubcommand(s =>
        s.setName("list")
          .setDescription("List roles")
      ),

    new SlashCommandBuilder()
      .setName("set-log")
      .setDescription("Set ticket log channel")
      .addChannelOption(o =>
        o.setName("channel").setDescription("Log channel").setRequired(true)
      )
  ];

  await client.application.commands.set(commands, process.env.GUILD_ID);
});

/* ================= SLASH COMMANDS ================= */

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand()) {

    /* SETUP PANEL */
    if (interaction.commandName === "setup") {
      if (interaction.user.id !== OWNER_ID)
        return interaction.reply({ content: "❌ Not allowed", ephemeral: true });

      const embed = new EmbedBuilder()
        .setTitle("🎫 Ticket Support")
        .setDescription(
          `<:${TICKET_EMOJI.name}:${TICKET_EMOJI.id}> React with the emoji below to open a ticket`
        )
        .setColor(0xff0000)
        .setThumbnail(interaction.guild.iconURL())
        .setFooter({
          text: "Ticket System",
          iconURL: interaction.guild.iconURL()
        });

      const msg = await interaction.channel.send({ embeds: [embed] });
      PANEL_MESSAGE_ID = msg.id;

      await msg.react(`${TICKET_EMOJI.name}:${TICKET_EMOJI.id}`);

      return interaction.reply({ content: "✅ Ticket panel created", ephemeral: true });
    }

    /* ROLE MANAGEMENT */
    if (interaction.commandName === "ticket-role") {
      if (interaction.user.id !== OWNER_ID)
        return interaction.reply({ content: "❌ Not allowed", ephemeral: true });

      const role = interaction.options.getRole("role");

      if (interaction.options.getSubcommand() === "add") {
        ticketRoles.add(role.id);
        return interaction.reply({ content: `✅ Added ${role}`, ephemeral: true });
      }

      if (interaction.options.getSubcommand() === "remove") {
        ticketRoles.delete(role.id);
        return interaction.reply({ content: `❌ Removed ${role}`, ephemeral: true });
      }

      if (interaction.options.getSubcommand() === "list") {
        const list = [...ticketRoles].map(r => `<@&${r}>`).join("\n") || "No roles";
        return interaction.reply({ content: `📜 Ticket Roles:\n${list}`, ephemeral: true });
      }
    }

    /* SET LOG CHANNEL */
    if (interaction.commandName === "set-log") {
      if (interaction.user.id !== OWNER_ID)
        return interaction.reply({ content: "❌ Not allowed", ephemeral: true });

      LOG_CHANNEL_ID = interaction.options.getChannel("channel").id;
      return interaction.reply({ content: "✅ Log channel set", ephemeral: true });
    }
  }

  /* ================= BUTTONS ================= */

  if (interaction.isButton()) {
    const data = tickets.get(interaction.channel.id);
    if (!data) return;

    const isStaff = [...ticketRoles].some(r =>
      interaction.member.roles.cache.has(r)
    );

    if (interaction.customId === "claim") {
      if (!isStaff)
        return interaction.reply({ content: "❌ Staff only", ephemeral: true });

      data.claimed = interaction.user.id;

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("close")
          .setLabel("Close")
          .setStyle(ButtonStyle.Danger)
      );

      return interaction.update({
        content: `✅ Claimed by ${interaction.user}`,
        components: [row]
      });
    }

    if (interaction.customId === "close") {
      if (!data.claimed)
        return interaction.reply({ content: "❌ Ticket not claimed", ephemeral: true });

      await interaction.channel.permissionOverwrites.edit(
        interaction.guild.id,
        { SendMessages: false }
      );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("reopen")
          .setLabel("Reopen")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId("delete")
          .setLabel("Delete")
          .setStyle(ButtonStyle.Danger)
      );

      return interaction.update({
        content: "🔒 Ticket closed",
        components: [row]
      });
    }

    if (interaction.customId === "reopen") {
      if (!isStaff)
        return interaction.reply({ content: "❌ Staff only", ephemeral: true });

      await interaction.channel.permissionOverwrites.edit(
        interaction.guild.id,
        { SendMessages: true }
      );

      return interaction.reply({ content: "🔓 Ticket reopened" });
    }

    if (interaction.customId === "delete") {
      if (!isStaff)
        return interaction.reply({ content: "❌ Staff only", ephemeral: true });

      setTimeout(() => interaction.channel.delete(), 5000);
    }
  }
});

/* ================= REACTION HANDLER ================= */

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (user.bot) return;

  if (reaction.partial) await reaction.fetch();
  if (reaction.message.partial) await reaction.message.fetch();

  if (reaction.message.id !== PANEL_MESSAGE_ID) return;
  if (reaction.emoji.id !== TICKET_EMOJI.id) return;

  const guild = reaction.message.guild;
  const parent = reaction.message.channel.parentId;

  ticketCount++;

  const overwrites = [
    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    {
      id: user.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages
      ]
    }
  ];

  ticketRoles.forEach(r =>
    overwrites.push({
      id: r,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages
      ]
    })
  );

  const channel = await guild.channels.create({
    name: `ticket-${ticketCount}`,
    type: ChannelType.GuildText,
    parent,
    permissionOverwrites: overwrites
  });

  tickets.set(channel.id, { ownerId: user.id, claimed: null });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("claim")
      .setLabel("Claim")
      .setStyle(ButtonStyle.Primary)
  );

  await channel.send({
    content: `👋 <@${user.id}>`,
    components: [row]
  });

  if (LOG_CHANNEL_ID) {
    const log = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (log)
      log.send(`📩 Ticket created by ${user.tag} → ${channel}`);
  }
});

/* ================= LOGIN ================= */

client.login(process.env.TOKEN);