const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
require('dotenv').config();

const app = express();

// Configuração do Bot do Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

client.once('ready', () => {
    console.log(`Bot ligado como ${client.user.tag}`);
});

// Listener para o comando /painel-verificacao
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'painel-verificacao') {
        const clientId = process.env.CLIENT_ID;
        const redirectUri = encodeURIComponent(process.env.REDIRECT_URI);
        // Escopos necessários: identify, guilds.join
        const oauthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=identify%20guilds.join`;

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setStyle(ButtonStyle.Link)
                .setLabel('Verificar no Discord')
                .setURL(oauthUrl)
        );

        const embed = new EmbedBuilder()
            .setTitle('Painel de Verificação')
            .setDescription('Clica no botão abaixo para fazeres a tua verificação de segurança e teres acesso aos servidores.')
            .setColor(0x00FF00);

        await interaction.reply({
            embeds: [embed],
            components: [row],
            ephemeral: false
        });
    }
});

// Configuração do Servidor Web (Express) para o callback do OAuth2
app.get('/callback', async (req, res) => {
    const code = req.query.code;
    
    if (!code) {
        return res.status(400).send('Erro: Código de autorização não encontrado.');
    }

    try {
        // 1. Trocar o código por um Access Token
        const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            body: new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: process.env.REDIRECT_URI,
            }),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        const tokenData = await tokenResponse.json();

        if (!tokenData.access_token) {
            return res.status(400).send('Erro ao obter o token de acesso do Discord.');
        }

        const accessToken = tokenData.access_token;

        // 2. Obter os dados do utilizador autenticado
        const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: {
                authorization: `Bearer ${accessToken}`,
            },
        });

        const userData = await userResponse.json();
        const userId = userData.id;

        // 3. Adicionar o utilizador ao segundo servidor (GUILD_B_ID) e dar o cargo (VERIFIED_ROLE_ID)
        const guildBId = process.env.GUILD_B_ID;
        const verifiedRoleId = process.env.VERIFIED_ROLE_ID;

        const guild = await client.guilds.fetch(guildBId);
        
        // Adiciona o membro à Guild B (requer que o bot esteja no servidor B com a permissão "Create Instant Invite" ou permissões adequadas)
        await guild.members.add(userId, {
            accessToken: accessToken,
            roles: [verifiedRoleId] // Atribui o cargo diretamente ao entrar
        });

        res.send('<h1>Verificação concluída com sucesso!</h1><p>Foste verificado e adicionado ao servidor com sucesso. Podes fechar esta janela.</p>');
    } catch (error) {
        console.error('Erro no callback:', error);
        res.status(500).send('Erro interno durante o processo de verificação.');
    }
});

// Porta dinâmica exigida pelo Render
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor web a correr na porta ${PORT}`);
});

client.login(process.env.BOT_TOKEN);