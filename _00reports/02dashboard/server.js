import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { carregarDados, consultarDados } from './dados.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
const source = path.resolve(directory, '..', '..', 'crawler');

export function criarServidor() {
  let snapshot;
  let loading;
  return http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method !== 'GET') {
        res.writeHead(405, { Allow: 'GET' });
        return res.end('Somente leitura.');
      }
      if (['/', '/index.html', '/entradas', '/saidas', '/ativos'].includes(url.pathname)) {
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        return res.end(await readFile(path.join(directory, 'index.html')));
      }
      if (url.pathname !== '/api/relatorio') {
        res.writeHead(404);
        return res.end('Nao encontrado.');
      }
      if (!snapshot || url.searchParams.get('atualizar') === '1') {
        if (!loading) loading = carregarDados(source).then(data => { snapshot = data; }).finally(() => { loading = null; });
        await loading;
      }
      let result;
      try {
        result = consultarDados(snapshot, url.searchParams);
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ erro: error.message }));
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(result));
    } catch (error) {
      console.error('[Dashboard]', error);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ erro: `Nao foi possivel ler as bases: ${error.message}` }));
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.DASHBOARD_PORT || 3110);
  const server = criarServidor();
  server.on('error', error => {
    console.error(`[Dashboard] Falha ao iniciar: ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`[Dashboard] http://127.0.0.1:${server.address().port}`);
    console.log(`[Dashboard] Somente leitura: ${source}`);
  });
}
