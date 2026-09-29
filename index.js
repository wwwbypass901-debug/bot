require('dotenv').config();

const express = require('express');
const {
    Client,
    GatewayIntentBits,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
} = require('discord.js');

// ─── Variáveis de ambiente ────────────────────────────────────────────────────
const BOT_TOKEN       = process.env.BOT_TOKEN;
const CLIENT_ID       = process.env.CLIENT_ID;
const CLIENT_SECRET   = process.env.CLIENT_SECRET;
const GUILD_A_ID      = process.env.GUILD_A_ID;       // servidor principal
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID; // cargo a atribuir no /painel-verificacao

// URL de produção — obrigatória no Render
const REDIRECT_URI = 'https://bot-9o4t.onrender.com/callback';

// Validação antecipada de variáveis críticas
const required = { BOT_TOKEN, CLIENT_ID, CLIENT_SECRET, GUILD_A_ID, VERIFIED_ROLE_ID };
for (const [key, val] of Object.entries(required)) {
    if (!val) {
        console.error(`[ERRO CRÍTICO] Variável de ambiente "${key}" não está definida.`);
        process.exit(1);
    }
}

// ─── Estado em memória: mapeia state → guildId de destino ─────────────────────
const pendingGuilds = {};

// ─── Cliente Discord ──────────────────────────────────────────────────────────
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
    ],
});

client.once('ready', () => {
    console.log(`[BOT] Ligado com sucesso como ${client.user.tag}`);
});

// ─── Slash Commands ───────────────────────────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    // Gera uma chave de estado única para este fluxo OAuth2
    const stateKey = Math.random().toString(36).substring(2, 10);
    const encodedRedirect = encodeURIComponent(REDIRECT_URI);

    // ── /painel-verificacao ──────────────────────────────────────────────────
    if (interaction.commandName === 'painel-verificacao') {
        await interaction.deferReply({ ephemeral: false });

        // Destino: servidor principal — o callback vai atribuir o cargo VERIFIED_ROLE_ID
        pendingGuilds[stateKey] = { guildId: GUILD_A_ID, assignRole: true };

        const oauthUrl =
            `https://discord.com/api/oauth2/authorize` +
            `?client_id=${CLIENT_ID}` +
            `&redirect_uri=${encodedRedirect}` +
            `&response_type=code` +
            `&scope=identify%20guilds.join` +
            `&state=${stateKey}`;

        const embed = new EmbedBuilder()
            .setTitle('🔐 Painel de Verificação')
            .setDescription(
                'Clica no botão abaixo para realizares a verificação de segurança.\n' +
                'Após a verificação, o acesso aos canais será libertado automaticamente.'
            )
            .setColor(0x00FF00)
            .setFooter({ text: 'O link expira após utilização.' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('🔐 Verificar e Liberar Acesso')
                .setURL(oauthUrl)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
        console.log(`[CMD] /painel-verificacao → state=${stateKey} guild=${GUILD_A_ID}`);
    }

    // ── /puxar-membros ───────────────────────────────────────────────────────
    if (interaction.commandName === 'puxar-membros') {
        await interaction.deferReply({ ephemeral: false });

        const targetGuildId = interaction.options.getString('servidor_id');

        // Valida que é um snowflake numérico válido
        if (!/^\d{17,20}$/.test(targetGuildId)) {
            return interaction.editReply('❌ ID de servidor inválido. Certifica-te de que copiaste o ID correto.');
        }

        // Destino: servidor informado — sem atribuição automática de cargo
        pendingGuilds[stateKey] = { guildId: targetGuildId, assignRole: false };

        const oauthUrl =
            `https://discord.com/api/oauth2/authorize` +
            `?client_id=${CLIENT_ID}` +
            `&redirect_uri=${encodedRedirect}` +
            `&response_type=code` +
            `&scope=identify%20guilds.join` +
            `&state=${stateKey}`;

        const embed = new EmbedBuilder()
            .setTitle('🚀 Painel de Migração')
            .setDescription(
                `Clica no botão abaixo para seres adicionado ao servidor:\n\`${targetGuildId}\``
            )
            .setColor(0x5865F2)
            .setFooter({ text: 'O link expira após utilização.' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('🚀 Verificar e Entrar no Servidor')
                .setURL(oauthUrl)
        );

        await interaction.editReply({ embeds: [embed], components: [row] });
        console.log(`[CMD] /puxar-membros → state=${stateKey} guild=${targetGuildId}`);
    }
});

// ─── Express / Callback OAuth2 ────────────────────────────────────────────────
const app = express();

app.get('/callback', async (req, res) => {
    const { code, state } = req.query;

    if (!code) {
        return res.status(400).send('<h2>❌ Erro: código de autorização não encontrado.</h2>');
    }

    const pending = pendingGuilds[state];
    if (!pending) {
        return res.status(400).send('<h2>❌ Erro: estado de verificação inválido ou expirado.</h2>');
    }

    // Limpa a entrada para não reutilizar
    delete pendingGuilds[state];

    const { guildId, assignRole } = pending;

    try {
        // 1. Troca o código por um access token
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({
                client_id:     CLIENT_ID,
                client_secret: CLIENT_SECRET,
                grant_type:    'authorization_code',
                code:          code,
                redirect_uri:  REDIRECT_URI,
            }),
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        });

        const tokenData = await tokenResponse.json();

        if (!tokenData.access_token) {
            console.error('[ERRO] Token inválido:', tokenData);
            return res.status(400).send('<h2>❌ Erro ao obter token do Discord.</h2>');
        }

        const accessToken = tokenData.access_token;

        // 2. Obtém os dados do utilizador
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: { authorization: `Bearer ${accessToken}` },
        });
        const userData = await userResponse.json();
        const userId = userData.id;

        if (!userId) {
            return res.status(400).send('<h2>❌ Erro ao identificar o utilizador.</h2>');
        }

        console.log(`[CALLBACK] Utilizador ${userData.username}#${userData.discriminator} (${userId}) → guild ${guildId}`);

        // 3. Adiciona o utilizador ao servidor alvo
        try {
            const targetGuild = await client.guilds.fetch(guildId);

            const addOptions = { accessToken };

            // Atribui o cargo verificado apenas no servidor principal
            if (assignRole) {
                addOptions.roles = [VERIFIED_ROLE_ID];
            }

            await targetGuild.members.add(userId, addOptions);
            console.log(`[OK] ${userId} adicionado a ${guildId}${assignRole ? ' com cargo ' + VERIFIED_ROLE_ID : ''}`);
        } catch (err) {
            // Erro não-crítico: o utilizador pode já estar no servidor
            console.warn(`[AVISO] Ao adicionar membro: ${err.message}`);
        }

        return res.send(`
            <!DOCTYPE html>
            <html lang="pt">
            <head>
                <meta charset="UTF-8">
                <title>Verificação Concluída</title>
                <style>
                    body { font-family: sans-serif; display: flex; justify-content: center;
                           align-items: center; height: 100vh; margin: 0; background: #2c2f33; color: #fff; }
                    .box { text-align: center; padding: 2rem; border-radius: 8px; background: #36393f; }
                    h1 { color: #43b581; }
                    p  { color: #b9bbbe; }
                </style>
            </head>
            <body>
                <div class="box">
                    <h1>✅ Verificação concluída!</h1>
                    <p>Já podes fechar esta janela e voltar ao Discord.</p>
                </div>
            </body>
            </html>
        `);

    } catch (error) {
        console.error('[ERRO] No callback OAuth2:', error);
        return res.status(500).send('<h2>❌ Erro interno do servidor.</h2>');
    }
});

// Health-check para o Render manter o serviço acordado
app.get('/', (_req, res) => res.send('OK'));

// ─── Arranque ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[WEB] Servidor Express a correr na porta ${PORT}`);
});

client.login(BOT_TOKEN).catch((err) => {
    console.error('[ERRO CRÍTICO] Falha no login do bot:', err);
    process.exit(1);
});
