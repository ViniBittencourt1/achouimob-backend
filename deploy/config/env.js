import { backendEnvPath as ISOLATED_BACKEND_ENV } from '../../backend-paths.cjs';
import dotenv from 'dotenv';

dotenv.config({ path: ISOLATED_BACKEND_ENV });

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error("❌ STRIPE_SECRET_KEY não encontrada no .env");
}

console.log("✅ Variáveis de ambiente carregadas");