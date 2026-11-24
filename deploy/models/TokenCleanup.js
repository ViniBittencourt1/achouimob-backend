// Model para armazenar tokens temporários de limpeza
// Não interfere na rota atual
const mongoose = require('mongoose');

const TokenCleanupSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true },
  token: { type: String, required: true, unique: true },
  expires: { type: Number, required: true }
});

const TokenCleanup = mongoose.model('TokenCleanup', TokenCleanupSchema);

module.exports = { TokenCleanup };
