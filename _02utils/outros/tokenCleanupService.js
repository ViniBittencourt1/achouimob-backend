// Função para gerar link de limpeza de token
// Não interfere na rota atual
const crypto = require('crypto');
const { sendEmail } = require('../services/emailService'); // Supondo serviço de email já existente

function generateTokenCleanupLink(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  // Salva token temporário no banco (implementar)
  // Exemplo: TokenCleanup.create({ userId, token, expires: Date.now() + 3600000 })
  const link = `${process.env.FRONTEND_URL}/token-cleanup?token=${token}`;
  return { token, link };
}

async function sendTokenCleanupEmail(user) {
  const { link } = generateTokenCleanupLink(user.id);
  const subject = 'Limpeza de sessão: acesso exclusivo';
  const html = `<p>Olá, ${user.name}!<br>Você solicitou a limpeza de sessão.<br><a href="${link}">Clique aqui para liberar o acesso</a></p>`;
  await sendEmail(user.email, subject, html);
}

module.exports = {
  generateTokenCleanupLink,
  sendTokenCleanupEmail
};
