// ... (todo o teu código anterior mantém-se igual até ao final) ...

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor web a correr na porta ${PORT}`);
});

// Tentativa de login com tratamento de erro visível nos logs
client.login(BOT_TOKEN).catch(error => {
    console.error('❌ ERRO FATAL AO TENTAR LIGAR O BOT:', error);
});