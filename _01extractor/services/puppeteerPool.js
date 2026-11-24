// backend/src/services/puppeteerPool.js
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const puppeteer = require('puppeteer'); // Forçando o uso do Puppeteer padrão via require

// Removendo a configuração do puppeteer-extra e StealthPlugin

/**
 * Abre uma instância do navegador Puppeteer e uma nova página.
 * A configuração (headless) é controlada por variáveis de ambiente.
 * @param {{ headlessOverride?: boolean, hostResolverRules?: string, foraDaTela?: boolean }} [options]
 * @returns {Promise<puppeteer.Browser>}
 */
export async function abrirBrowser(options = {}) {
  // Assume que CRAWLER_HEADLESS é definido no .env e dotenv já foi carregado
  // Forçando headless: true, conforme solicitação do usuário.
  // Permitir controle por variável de ambiente, mas padrão para false para debug/bloqueios
  const envHeadless = process.env.CRAWLER_HEADLESS === "true";
  const headless = typeof options.headlessOverride === "boolean"
    ? options.headlessOverride
    : envHeadless;


  console.log(`[Puppeteer] Abrindo navegador em modo headless: ${headless}`);

  let browser;
  try {
    // Em Windows, usar o Puppeteer normal sem chromium bundled
    // Em Linux/Render, o chromium bundled já deveria estar instalado
    const launchOptions = {
      headless,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        ...(options.hostResolverRules ? [`--host-resolver-rules=${options.hostResolverRules}`] : []),
        '--disable-blink-features=AutomationControlled',
        '--window-size=1280,800',
        // Modo visivel em segundo plano: a janela abre fora da area da tela e sem pausar a pagina.
        ...(!headless && options.foraDaTela ? [
          '--window-position=-32000,-32000',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--disable-background-timer-throttling',
        ] : []),
        '--disable-cache', // Desabilitar cache para economizar memória
        '--disable-application-cache',
        '--disable-gpu-compositing', // Economizar GPU/memória
      ],
      defaultViewport: { width: 1280, height: 800 },
      timeout: 60000, // 60 segundos de timeout
    };

    browser = await puppeteer.launch({
      ...launchOptions,
    });
    console.log(`[Puppeteer Debug] Browser lançado com sucesso. Tipo: ${typeof browser}`);
    // Setar user-agent customizado para tentar evitar bloqueios
    const [page] = await browser.pages();
    if (page) {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      await page.setExtraHTTPHeaders({ 'accept-language': 'pt-BR,pt;q=0.9' });
      // Em modo visível (headless: false), fechar a única aba encerra o Chrome
      // inteiro (comportamento padrão do Windows). Só fecha em modo headless.
      if (headless) {
        try {
          await page.close();
        } catch (e) {}
      }
    }
    return browser;
  } catch (error) {
    console.error("[Puppeteer ERRO] Falha ao lançar o navegador:", error.message);
    throw error;
  }
}