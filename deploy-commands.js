require('dotenv').config();

const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const BOT_TOKEN  = process.env.BOT_TOKEN;
const CLIENT_ID  = process.env.CLIENT_ID;
const GUILD_A_ID = process.env.GUILD_A_ID;

// Validação antecipada
if (!BOT_TOKEN || !CLIENT_ID || !GUILD_A_ID) {
    console.error('[ERRO] BOT_TOKEN, CLIENT_ID e GUILD_A_ID são obrigatórios no .env');
    process.exit(1);
}

const commands = [
    new SlashCommandBuilder()
        .setName('painel-verificacao')
        .setDescription('Envia o painel de verificação para liberar o acesso aos canais.'),

    new SlashCommandBuilder()
        .setName('puxar-membros')
        .setDescription('Gera um link OAuth2 para adicionar membros a qualquer servidor.')
        .addStringOption(option =>
            option
                .setName('servidor_id')
                .setDescription('O ID do servidor de destino')
                .setRequired(true)
        ),
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);

(async () => {
    try {
        console.log(`[DEPLOY] A registar ${commands.length} slash commands no servidor ${GUILD_A_ID}...`);

        const data = await rest.put(
            Routes.applicationGuildCommands(CLIENT_ID, GUILD_A_ID),
            { body: commands },
        );

        console.log(`[DEPLOY] ✅ ${data.length} comando(s) registado(s) com sucesso!`);
    } catch (error) {
        console.error('[DEPLOY] ❌ Erro ao registar comandos:', error);
        process.exit(1);
    }
})();
