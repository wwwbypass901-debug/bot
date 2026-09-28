const express = require('express');
const { Client, GatewayIntentBits } = require('discord.js');
require('dotenv').config();

const app = express();

// Configuração do Bot do Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers
    ]
});

// Configuração do Servidor Web (Express)
app.get('/callback', async (req, res) => {
    // Coloca aqui a lógica do teu OAuth2 (código de verificação)
    res.send('Verificação concluída com sucesso! Podes fechar esta janela.');
});

// Porta dinâmica exigida pelo Render (com fallback para 3000 caso testes localmente)
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Servidor web a correr na porta ${PORT}`);
});

// Login do Bot do Discord
client.login(process.env.BOT_TOKEN);