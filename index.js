require('dotenv').config();
const { Client, GatewayIntentBits, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require('discord.js');
const express = require('express');
const axios = require('axios');

const app = express();
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

// Banco de dados em memória (para produção, use SQLite, MongoDB, etc.)
const userTokens = new Map();

// --- FUNÇÃO: Envia o painel de verificação no canal ---
async function enviarPainelVerificacao() {
    try {
        const channel = await client.channels.fetch('1520627829492940920');
        if (!channel) return console.warn('Canal de verificação não encontrado.');

        const oauthUrl = `https://discord.com/oauth2/authorize?client_id=${process.env.CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.REDIRECT_URI)}&response_type=code&scope=identify%20guilds.join`;

        const embed = new EmbedBuilder()
            .setDescription(
                '🔐 **POR QUE SE VERIFICAR?**\n\n' +
                'A verificação é necessária para **manter o servidor seguro e protegido** contra bots, contas falsas e possíveis abusos.\n\n' +
                'Ao verificar sua conta, ajudamos a garantir que apenas membros reais tenham acesso à comunidade, tornando o ambiente mais seguro para todos. 🛡️\n\n' +
                '✅ **Verifique-se para liberar seu acesso e ajudar a manter o servidor protegido.**\n\n' +
                '**Clique em `Verificar` abaixo para continuar.**'
            )
            .setColor(0x5865F2);

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setLabel('✅ Verificar-se')
                .setStyle(ButtonStyle.Link)
                .setURL(oauthUrl)
        );

        // Apaga mensagens antigas do bot no canal para não acumular
        const messages = await channel.messages.fetch({ limit: 20 });
        const botMessages = messages.filter(m => m.author.id === client.user.id);
        for (const msg of botMessages.values()) {
            await msg.delete().catch(() => {});
        }

        await channel.send({ embeds: [embed], components: [row] });
        console.log('✅ Painel de verificação enviado no canal.');
    } catch (err) {
        console.error('Erro ao enviar painel:', err.message);
    }
}

// --- FLUXO WEB OAUTH2 ---
app.get('/callback', async (req, res) => {
    const { code } = req.query;
    if (!code) return res.send('Erro: Código não informado.');

    try {
        // Troca o code pelo access_token
        const tokenResponse = await axios.post(
            'https://discord.com/api/oauth2/token',
            new URLSearchParams({
                client_id: process.env.CLIENT_ID,
                client_secret: process.env.CLIENT_SECRET,
                grant_type: 'authorization_code',
                code: code,
                redirect_uri: process.env.REDIRECT_URI
            }),
            { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
        );

        const { access_token, refresh_token } = tokenResponse.data;

        // Busca os dados do usuário que autorizou
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: { Authorization: `Bearer ${access_token}` }
        });

        const userId = userResponse.data.id;

        // Salva o token para uso futuro
        userTokens.set(userId, { access_token, refresh_token });
        console.log(`[+] Usuário ${userResponse.data.username} (${userId}) verificado.`);

        // Dá o cargo de verificado no Servidor A
        try {
            const guild = await client.guilds.fetch(process.env.GUILD_A_ID);
            const member = await guild.members.fetch(userId);
            await member.roles.add('1520623884242784408');
            console.log(`[+] Cargo adicionado para ${userResponse.data.username}`);
        } catch (roleErr) {
            console.warn(`Não foi possível dar o cargo para ${userId}:`, roleErr.message);
        }

        res.send(`
            <html>
            <body style="font-family:sans-serif;text-align:center;padding:60px;background:#2c2f33;color:#fff;">
                <h1>✅ Verificação concluída!</h1>
                <p>Você foi verificado com sucesso. Pode fechar esta página e voltar ao Discord.</p>
            </body>
            </html>
        `);
    } catch (error) {
        console.error('Erro no callback OAuth2:', error.response?.data || error.message);
        res.status(500).send('Ocorreu um erro durante a verificação. Tente novamente.');
    }
});

// --- COMANDOS DO BOT (Colocados após a criação do client) ---
client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    // Comando para enviar o painel manualmente
    if (interaction.commandName === 'painel-verificacao') {
        const adminRoleId = process.env.ADMIN_ROLE_ID;
        const hasPermission = adminRoleId
            ? interaction.member.roles.cache.has(adminRoleId)
            : interaction.member.permissions.has('Administrator');

        if (!hasPermission) {
            return interaction.reply({ content: '❌ Você não tem permissão para isso.', flags: 64 });
        }

        await interaction.deferReply({ flags: 64 });

        try {
            await enviarPainelVerificacao();
            await interaction.editReply({ content: '✅ Painel de verificação enviado com sucesso!' });
        } catch (err) {
            await interaction.editReply({ content: '❌ Erro ao enviar o painel.' });
        }
    }

    // Puxa todos os membros verificados para o Servidor B
    if (interaction.commandName === 'puxar-membros') {
        const adminRoleId = process.env.ADMIN_ROLE_ID;
        const hasPermission = adminRoleId
            ? interaction.member.roles.cache.has(adminRoleId)
            : interaction.member.permissions.has('Administrator');

        if (!hasPermission) {
            return interaction.reply({ content: '❌ Você não tem permissão para isso.', flags: 64 });
        }

        if (userTokens.size === 0) {
            return interaction.reply({ content: '⚠️ Nenhum membro verificado encontrado.', flags: 64 });
        }

        await interaction.deferReply({ flags: 64 });

        const targetGuildId = process.env.GUILD_B_ID;
        let sucessos = 0;
        let falhas = 0;
        let jaMembro = 0;

        for (const [userId, tokens] of userTokens.entries()) {
            try {
                const response = await axios.put(
                    `https://discord.com/api/guilds/${targetGuildId}/members/${userId}`,
                    { access_token: tokens.access_token },
                    {
                        headers: {
                            Authorization: `Bot ${process.env.BOT_TOKEN}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );

                if (response.status === 201) {
                    sucessos++;
                } else {
                    jaMembro++;
                }
            } catch (err) {
                console.error(`Falha ao puxar o usuário ${userId}:`, err.response?.data || err.message);
                falhas++;
            }
        }

        await interaction.editReply(
            `✅ Processo concluído!\n` +
            `➕ **${sucessos}** membros adicionados ao Servidor B\n` +
            `🔁 **${jaMembro}** já eram membros\n` +
            `❌ **${falhas}** falhas`
        );
    }
});

client.once('clientReady', async () => {
    console.log(`✅ Bot online como ${client.user.tag}`);
    app.listen(3000, () => console.log('🌐 Servidor web ativo na porta 3000'));

    // Envia o painel de verificação automaticamente ao ligar
    await enviarPainelVerificacao();
});

client.login(process.env.BOT_TOKEN);