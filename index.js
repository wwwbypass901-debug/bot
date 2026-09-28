const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes } = require('discord.js');

const app = express();

// Configurações principais
const BOT_TOKEN = process.env.BOT_TOKEN || "MTU1MzkwNTIyMTAwNzE4ODAwOQ.GAOuWZ.RQ4dX3dJzEdH-OAQaUnzqBoTIbIedske-9c9ic";
const CLIENT_ID = process.env.CLIENT_ID || "1553905221007188009";
const CLIENT_SECRET = process.env.CLIENT_SECRET || "wC2OPOPUkZpQumZ3nLkbP8d4OJdW2UUC";
const REDIRECT_URI = process.env.REDIRECT_URI || "https://bot-9o4t.onrender.com/callback";
const GUILD_A_ID = process.env.GUILD_A_ID || "1421344925307506751";
const VERIFIED_ROLE_ID = "1520623884242784408";

let pendingGuilds = {};

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

client.once('ready', async () => {
    console.log(`Bot ligado como ${client.user.tag}!`);

    const commands = [
        new SlashCommandBuilder()
            .setName('painel-verificacao')
            .setDescription('Envia o painel de verificação padrão para liberar os canais.'),
        
        new SlashCommandBuilder()
            .setName('puxar-membros')
            .setDescription('Puxa os membros verificados para qualquer ID de servidor informado.')
            .addStringOption(option =>
                option.setName('servidor_id')
                    .setDescription('O ID do servidor de destino para onde os membros serão puxados')
                    .setRequired(true)
            )
    ].map(cmd => cmd.toJSON());

    const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

    try {
        console.log('A registar slash commands no servidor...');
        await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_A_ID),
            { body: commands },
        );
        console.log('✅ Slash commands registados com sucesso no servidor!');
    } catch (error) {
        console.error('Erro ao registar comandos:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    try {
        const stateKey = Math.random().toString(36).substring(7);

        if (interaction.commandName === 'painel-verificacao') {
            await interaction.deferReply({ ephemeral: false });

            pendingGuilds[stateKey] = interaction.guild.id;

            const encodedRedirect = encodeURIComponent(REDIRECT_URI);
            const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodedRedirect}&response_type=code&scope=identify%20guilds.join&state=${stateKey}`;

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setStyle(ButtonStyle.Link)
                    .setLabel('🔐 Verificar e Liberar Acesso')
                    .setURL(oauthUrl)
            );

            const embed = new EmbedBuilder()
                .setTitle('Painel de Verificação')
                .setDescription('Clica no botão abaixo para realizares a verificação de segurança e desbloqueares os canais.')
                .setColor(0x00FF00);

            await interaction.editReply({ embeds: [embed], components: [row] });
        }

        if (interaction.commandName === 'puxar-membros') {
            await interaction.deferReply({ ephemeral: false });

            const targetGuildId = interaction.options.getString('servidor_id');
            pendingGuilds[stateKey] = targetGuildId;

            const encodedRedirect = encodeURIComponent(REDIRECT_URI);
            const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${CLIENT_ID}&redirect_uri=${encodedRedirect}&response_type=code&scope=identify%20guilds.join&state=${stateKey}`;

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setStyle(ButtonStyle.Link)
                    .setLabel('🚀 Verificar e Entrar no Servidor')
                    .setURL(oauthUrl)
            );

            const embed = new EmbedBuilder()
                .setTitle('Painel de Migração / Puxada')
                .setDescription(`Clica no botão abaixo para te verificares e seres adicionado automaticamente ao servidor destino ID: \`${targetGuildId}\`.`)
                .setColor(0x5865F2);

            await interaction.editReply({ embeds: [embed], components: [row] });
        }
    } catch (error) {
        console.error('Erro ao processar comando:', error);
    }
});

app.get('/callback', async (req, res) => {
    const code = req.query.code;
    const state = req.query.state;
    
    if (!code) {
        return res.status(400).send('Erro: Código de autorização não encontrado.');
    }

    const targetGuildId = pendingGuilds[state];

    try {
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: REDIRECT_URI,
            }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        const tokenData = await tokenResponse.json();
        if (!tokenData.access_token) {
            return res.status(400).send('Erro ao obter o token de acesso do Discord.');
        }

        const accessToken = tokenData.access_token;

        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { authorization: `Bearer ${accessToken}` },
        });
        const userData = await userResponse.json();
        const userId = userData.id;

        if (targetGuildId) {
            try {
                const targetGuild = await client.guilds.fetch(targetGuildId);
                await targetGuild.members.add(userId, {
                    accessToken: accessToken,
                    roles: [VERIFIED_ROLE_ID]
                });
            } catch (err) {
                console.error('Erro ao adicionar membro ao servidor:', err);
            }
        }

        res.send('<h1>✅ Verificação concluída com sucesso!</h1><p>Foste verificado e adicionado ao servidor. Podes fechar esta janela.</p>');
    } catch (error) {
        console.error('Erro no callback:', error);
        res.status(500).send('Erro interno durante o processo de verificação.');
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor web a correr na porta ${PORT}`);
});

client.login(BOT_TOKEN).catch(error => {
    console.error('❌ ERRO FATAL AO TENTAR LIGAR O BOT:', error);
});