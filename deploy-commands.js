require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
    new SlashCommandBuilder()
        .setName('painel-verificacao')
        .setDescription('Envia o painel de verificação com o botão OAuth2'),

    new SlashCommandBuilder()
        .setName('puxar-membros')
        .setDescription('(Admin) Puxa todos os membros verificados para o Servidor B')
].map(cmd => cmd.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);

(async () => {
    try {
        console.log('Registrando slash commands...');

        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_A_ID),
            { body: commands }
        );

        console.log('✅ Slash commands registrados com sucesso no Servidor A!');
    } catch (error) {
        console.error('Erro ao registrar comandos:', error);
    }
})();
