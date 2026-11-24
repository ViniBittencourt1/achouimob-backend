#!/usr/bin/env node

/**
 * Executor de Crawlers Local com Notificação por Email
 * Versão CommonJS usada para empacotamento com pkg (--targets node22-win-x64)
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const dotenv = require('dotenv');
const { reportHtml, saveReport, emailReport } = require('./crawler-report.cjs');
const { resolveNodeExecutable } = require('./node-runtime.cjs');
const { localPath, launcherBackend } = require('./backend-paths.cjs');

const isPkg = typeof process.pkg !== 'undefined';
const BACKEND_DIR = launcherBackend({
  sourceDir: __dirname, executablePath: process.execPath,
  packaged: isPkg, configured: process.env.RASPAGEM_IMOVEIS_BACKEND,
});
const LOGS_DIR = localPath(BACKEND_DIR, 'logs');
const RUN_LABEL = process.env.CRAWLER_RUN_LABEL || 'Raspagem de Imóveis';

// Carregar variáveis de ambiente
dotenv.config({ path: localPath(BACKEND_DIR, '.env') });

// Criar diretório de logs
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(LOGS_DIR, `crawler_${timestamp}.log`);
const reportFile = path.join(LOGS_DIR, `crawler_${timestamp}.json`);
const OUTPUT_LIMIT = 256 * 1024;
process.env.CRAWLER_REPORT_PATH = reportFile;

// Logger
function log(message, level = 'INFO') {
  const time = new Date().toLocaleString('pt-BR');
  const line = `[${time}] [${level}] ${message}`;
  console.log(line);
  fs.appendFileSync(logFile, line + '\n');
}

// Configuração de email
const emailConfig = {
  host: process.env.EMAIL_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.EMAIL_PORT || '587'),
  secure: process.env.EMAIL_SECURE === 'true',
  connectionTimeout: 30000,
  greetingTimeout: 30000,
  socketTimeout: 60000,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
};

const emailTo = process.env.EMAIL_NOTIFY_TO || process.env.EMAIL_USER;
const emailFrom = process.env.EMAIL_USER;

// Criar transporter de email
let transporter = null;

if (emailFrom && process.env.EMAIL_PASSWORD) {
  transporter = nodemailer.createTransport(emailConfig);
} else {
  log('⚠️  Email não configurado. Notificações desabilitadas.', 'WARN');
}

/**
 * Enviar email de notificação
 */
async function sendEmail(subject, htmlContent) {
  if (!transporter) return;

  try {
    await transporter.sendMail({
      from: emailFrom,
      to: emailTo,
      subject: subject,
      html: htmlContent,
      text: htmlContent.replace(/<[^>]*>/g, ''),
      attachments: fs.existsSync(reportFile) ? [
        { filename: path.basename(reportFile), content: JSON.stringify(emailReport(JSON.parse(fs.readFileSync(reportFile, 'utf8'))), null, 2) },
        { filename: path.basename(reportFile.replace(/\.json$/, '.html')), content: reportHtml(JSON.parse(fs.readFileSync(reportFile, 'utf8'))) },
      ] : [],
    });
    log(`📧 Email enviado para ${emailTo}`, 'EMAIL');
  } catch (error) {
    log(`❌ Erro ao enviar email: ${error.message}`, 'ERROR');
  }
}

/**
 * Executar crawlers
 */
async function runCrawlers() {
  const startTime = new Date();
  log('=====================================');
  log('🚀 Iniciando execução de crawlers', 'START');
  log('=====================================');

  const env = {
    ...process.env,
    RENDER: 'true',
    CRAWLER_HEADLESS: 'true',
    NODE_OPTIONS: '--max-old-space-size=2048 --expose-gc',
  };

  return new Promise((resolve) => {
    const startChildTime = Date.now();
    let output = '';
    let errorOutput = '';

    try {
      const nodeExecutable = resolveNodeExecutable({ env });
      log(`Node.js dos crawlers: ${nodeExecutable}`);
      const childProcess = spawn(nodeExecutable, ['render-daily.js'], {
        cwd: BACKEND_DIR,
        env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      childProcess.stdout.on('data', (data) => {
        const chunk = data.toString();
        output = (output + chunk).slice(-OUTPUT_LIMIT);
        process.stdout.write(chunk);
        fs.appendFileSync(logFile, chunk);
      });

      childProcess.stderr.on('data', (data) => {
        const chunk = data.toString();
        errorOutput = (errorOutput + chunk).slice(-OUTPUT_LIMIT);
        process.stderr.write(chunk);
        fs.appendFileSync(logFile, chunk);
      });

      childProcess.on('close', (code) => {
        const endTime = new Date();
        const duration = ((endTime - startTime) / 1000 / 60).toFixed(2);
        if (fs.existsSync(reportFile)) {
          const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
          if (!report.endedAt) {
            report.endedAt = endTime.toISOString();
            report.error = `Executor diario encerrado antes do fim (codigo ${code}). Projetos pendentes nao foram tentados.`;
            for (const project of report.projects) {
              if (project.status === 'running') {
                project.status = 'interrupted';
                project.error = report.error;
              }
            }
            saveReport(report, reportFile);
          }
        }

        if (code === 0) {
          log('=====================================');
          log(`✅ Crawlers executados com SUCESSO`, 'SUCCESS');
          log(`⏱️  Tempo total: ${duration} minutos`, 'SUCCESS');
          log('=====================================');

          resolve({
            success: true,
            code,
            output,
            errorOutput,
            duration,
            startTime,
            endTime,
          });
        } else {
          log('=====================================');
          log(`❌ ERRO: Crawlers falharam com código ${code}`, 'ERROR');
          log(`⏱️  Tempo até falha: ${duration} minutos`, 'ERROR');
          log('=====================================');

          resolve({
            success: false,
            code,
            output,
            errorOutput,
            duration,
            startTime,
            endTime,
          });
        }
      });

      childProcess.on('error', (error) => {
        log(`❌ Erro ao executar crawlers: ${error.message}`, 'ERROR');
        resolve({
          success: false,
          code: 1,
          output,
          errorOutput: error.message,
          duration: ((Date.now() - startChildTime) / 1000 / 60).toFixed(2),
          startTime,
          endTime: new Date(),
        });
      });
    } catch (error) {
      log(`❌ Erro crítico ao iniciar crawlers: ${error.message}`, 'ERROR');
      resolve({
        success: false,
        code: 1,
        output,
        errorOutput: error.message,
        duration: ((Date.now() - startChildTime) / 1000 / 60).toFixed(2),
        startTime,
        endTime: new Date(),
      });
    }
  });
}

/**
 * Gerar HTML do email
 */
function generateEmailHTML(result) {
  if (fs.existsSync(reportFile)) {
    const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
    return reportHtml(report);
  }
  const { success, duration, startTime, endTime, code, output, errorOutput } = result;

  const statusColor = success ? '#28a745' : '#dc3545';
  const statusText = success ? '✅ SUCESSO' : '❌ FALHA';
  const statusIcon = success ? '✓' : '✗';

  const linhas = output.split('\n');
  const totalProjetos = linhas
    .find((l) => /Rodada diaria com/.test(l))
    ?.match(/\d+/)?.[0] || '?';
  const resumo = linhas.slice(-10).join('<br>');
  const resumoErro = (errorOutput || '').split('\n').filter(Boolean).slice(-20).join('<br>');

  return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: ${statusColor}; color: white; padding: 20px; border-radius: 5px; text-align: center; margin-bottom: 20px; }
        .header h1 { margin: 0; font-size: 24px; }
        .content { background-color: #f5f5f5; padding: 20px; border-radius: 5px; }
        .info { margin: 10px 0; }
        .label { font-weight: bold; color: ${statusColor}; }
        .logs { background-color: #fff; padding: 10px; border-left: 4px solid ${statusColor}; font-family: monospace; font-size: 12px; max-height: 300px; overflow-y: auto; margin-top: 10px; }
        .footer { text-align: center; margin-top: 20px; font-size: 12px; color: #999; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>${statusIcon} ${statusText}</h1>
            <p>${RUN_LABEL}</p>
        </div>

        <div class="content">
            <div class="info">
                <span class="label">Status:</span> ${success ? 'Finalizado com sucesso' : `Falhou com código ${code}`}
            </div>

            <div class="info">
                <span class="label">Inicio:</span> ${startTime.toLocaleString('pt-BR')}
            </div>

            <div class="info">
                <span class="label">Fim:</span> ${endTime.toLocaleString('pt-BR')}
            </div>

            <div class="info">
                <span class="label">Duração:</span> ${duration} minutos
            </div>

            <div class="info">
                <span class="label">Projetos:</span> ${totalProjetos} crawlers agendados
            </div>

            <div class="logs">
                <strong>Últimas linhas do log:</strong><br>
                ${resumo}
            </div>
            ${!success && resumoErro ? `
            <div class="logs" style="border-left-color:#dc3545; margin-top:10px;">
                <strong>Últimas linhas do erro (stderr):</strong><br>
                ${resumoErro}
            </div>` : ''}
        </div>

        <div class="footer">
            <p>Log completo salvo em: ${logFile}</p>
            <p>${RUN_LABEL} - Execução Local</p>
        </div>
    </div>
</body>
</html>
  `;
}

/**
 * Função principal
 */
async function main() {
  try {
    log(`Arquivo de log: ${logFile}`);
    log(`Diretório de trabalho: ${BACKEND_DIR}`);

    const result = await runCrawlers();

    const subject = result.success
      ? `✅ ${RUN_LABEL} - Execução com Sucesso`
      : `❌ ${RUN_LABEL} - Execução Falhou`;

    const htmlContent = generateEmailHTML(result);
    await sendEmail(subject, htmlContent);

    process.exit(result.success ? 0 : 1);
  } catch (error) {
    log(`❌ ERRO CRÍTICO: ${error.message}`, 'FATAL');
    log(error.stack, 'FATAL');

    const htmlContent = `
<html>
<body style="font-family: Arial;">
    <h2 style="color: red;">❌ ERRO CRÍTICO</h2>
    <p><strong>Mensagem:</strong> ${error.message}</p>
    <p><strong>Log:</strong> ${logFile}</p>
</body>
</html>
    `;

    await sendEmail(`❌ ${RUN_LABEL} - Erro Crítico`, htmlContent);
    process.exit(1);
  }
}

main();
