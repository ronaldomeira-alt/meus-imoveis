import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { BUILTINS } from '../supabase/functions/_shared/central-bots/core.js';
import { TOOL_CATALOG } from '../supabase/functions/_shared/central-bots/tools.js';

// All data is local test fixtures. This server never calls production services.
const now = '2026-10-03T15:00:00.000Z';
const bots = BUILTINS.map((bot, i) => ({
  ...bot,
  id: `bot-${i}`,
  active: true,
  last_run: null,
  schedule: i === 2 ? { enabled: true, next_run_at: now } : null,
}));
const fixture = {
  bots,
  tools: TOOL_CATALOG,
  provider_configured: true,
  settings: { enabled: true, last_tick_at: now },
  approvals: [
    {
      id: 'approval-fixture',
      bot_id: 'bot-2',
      status: 'pending',
      reason: 'Investigar ocorrência de teste sem modificar produção.',
      action: 'investigate_incident',
      created_at: now,
      context: { incident_id: 'incident-fixture' },
    },
  ],
  incidents: [
    {
      id: 'incident-fixture',
      bot_id: 'bot-2',
      component: 'Fonte de teste',
      observed: 'Telemetria não disponível no cenário de teste.',
      expected: 'Dados disponíveis',
      impact: 'medium',
      confidence: 0.65,
      last_seen_at: now,
      dossier: { evidence: { fixture: true }, execution_allowed: false },
    },
  ],
};
const mockModule = `
const data = ${JSON.stringify(fixture)};
const messages = {};
window.__agentActions = [];
export const CENTRAL_BOTS_ENABLED = true;
export async function audioBase64() { return 'test-audio'; }
export async function centralRequest(body) {
  window.__agentActions.push(body);
  if (window.__failCentral) throw new Error('Falha simulada de conexão');
  if (body.action === 'list') return structuredClone(data);
  if (body.action === 'conversation') return { conversation_id: body.bot_id, messages: messages[body.bot_id] || [], runs: [], events: [] };
  if (body.action === 'chat') {
    (messages[body.bot_id] ||= []).push({id: crypto.randomUUID(), role:'user', content:body.content, created_at:'${now}', sources:[]}, {id:crypto.randomUUID(), role:'assistant', content:'Consulta de teste concluída: 3 contatos.', created_at:'${now}', sources:[{tool:'getCaptureSummary', observed_at:'${now}', data:{count:3, fixture:true}}]});
    return {message:messages[body.bot_id].at(-1)};
  }
  if (body.action === 'create_bot') { const bot = {...body.bot, id:'bot-custom', slug:'custom', kind:'custom', active:true}; data.bots.push(bot); return {bot}; }
  if (body.action === 'approval') { data.approvals = data.approvals.filter(a => a.id !== body.approval_id); return {approval:{status:'executed'}}; }
  if (body.action === 'transcribe') return {text:'Pergunta ditada no teste'};
  if (body.action === 'incident') return {dossier:data.incidents[0].dossier};
  return {};
}`;

test(
  'Central desktop/mobile: chat, sources, bots, approvals, voice, error recovery and layout',
  { timeout: 120000 },
  async () => {
    const server = await createServer({
      configFile: false,
      cacheDir: '.audit_screenshots/central-test-cache',
      oxc: { jsx: { runtime: 'automatic' } },
      server: { port: 0, host: '127.0.0.1' },
      plugins: [
        {
          name: 'isolated-central-fixtures',
          enforce: 'pre',
          resolveId(id) {
            if (id === '/__central_entry.js') return '\0central-test-entry';
          },
          load(id) {
            if (id.replaceAll('\\', '/').endsWith('/src/lib/central-bots.ts'))
              return mockModule;
            if (id === '\0central-test-entry')
              return `import React from 'react'; import {createRoot} from 'react-dom/client'; import Central from '/src/components/agents/CentralBotsView.tsx'; import '/src/index.css'; createRoot(document.getElementById('root')).render(React.createElement(Central,{onOpenMenu:()=>window.__menuOpened=true,onOpenCaptador:()=>window.__captadorOpened=true}));`;
          },
          configureServer(vite) {
            vite.middlewares.use('/__central_test', (_req, res) => {
              res.setHeader('Content-Type', 'text/html');
              res.end(
                '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"/></head><body><div id="root"></div><script type="module" src="/__central_entry.js"></script></body></html>',
              );
            });
          },
        },
      ],
      optimizeDeps: { include: ['react', 'react-dom/client', 'lucide-react'] },
    });
    let browser;
    try {
      await server.listen();
      browser = await puppeteer.launch({
        executablePath:
          process.env.CHROME_PATH ||
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
        headless: true,
        pipe: true,
        args: [
          '--use-fake-ui-for-media-stream',
          '--use-fake-device-for-media-stream',
        ],
      });
      const page = await browser.newPage();
      const errors = [];
      page.on('pageerror', (error) => {
        errors.push(error.message);
        console.error('Browser error:', error.message);
      });
      page.on('console', (message) => {
        if (message.type() === 'error')
          console.error('Browser console:', message.text());
      });
      await page.setViewport({ width: 1440, height: 960 });
      await page.goto(
        `http://127.0.0.1:${server.httpServer.address().port}/__central_test`,
      );
      await page.waitForSelector('.agent-bot-item', { timeout: 30000 });
      await page.waitForFunction(
        () =>
          document.querySelector('.agent-empty h3')?.textContent ===
          'Bot Gestor',
      );
      assert.equal(
        await page.$$eval('.agent-bot-item', (items) =>
          items.map((i) => i.querySelector('strong').textContent).join(','),
        ),
        'Bot Gestor,Bot Captador,Bot Sentinela',
      );
      await page.type('.agent-composer textarea', 'Quantos contatos existem?');
      await page.click('[aria-label="Enviar mensagem"]');
      await page.waitForSelector('.agent-message-assistant');
      assert.match(
        await page.$eval('.agent-message-assistant', (e) => e.textContent),
        /3 contatos/,
      );
      await page.click('.agent-message details summary');
      assert.match(
        await page.$eval('.agent-source', (e) => e.textContent),
        /fixture/,
      );
      await page.click('[aria-label="Adicionar bot"]');
      await page.waitForSelector('dialog[open]');
      await page.type('dialog input:not([type=checkbox])', 'Analista de teste');
      await page.type(
        'dialog textarea',
        'Consultar a operação e apresentar um resumo.',
      );
      await page.click('dialog .agent-primary');
      await page.waitForFunction(
        () =>
          document.querySelector('.agent-topbar h2')?.textContent ===
          'Analista de teste',
      );
      await page.waitForFunction(
        () => document.querySelectorAll('.agent-bot-item').length === 4,
      );
      await page.screenshot({ path: '.audit_screenshots/central-desktop.png' });

      for (const width of [390, 320]) {
        await page.setViewport({
          width,
          height: 844,
          isMobile: true,
          hasTouch: true,
          deviceScaleFactor: 1,
        });
        await page.waitForFunction(
          () =>
            document.querySelector('.agent-workspace').getBoundingClientRect()
              .width <= innerWidth,
        );
        await page.click('button[aria-label="Meus bots"]');
        await page.waitForFunction(
          () =>
            document.querySelector('.agent-sidebar').getBoundingClientRect()
              .left >= -1,
        );
        await page.click('.agent-bot-item:nth-child(3)');
        await page.waitForFunction(
          () =>
            document.querySelector('.agent-topbar h2')?.textContent ===
            'Bot Sentinela',
        );
        await page.waitForFunction(
          () =>
            document.querySelector('.agent-sidebar').getBoundingClientRect()
              .right <= 1,
        );
        await page.click('.agent-tabs button:nth-child(3)');
        await page.waitForSelector('.agent-incident');
        const overflow = await page.evaluate(() =>
          [
            ...document.querySelectorAll(
              '.agent-main, .agent-topbar, .agent-incident',
            ),
          ].some((e) => e.scrollWidth > e.clientWidth + 2),
        );
        assert.equal(overflow, false, `No horizontal overflow at ${width}px`);
        await page.screenshot({
          path: `.audit_screenshots/central-mobile-${width}.png`,
        });
      }
      await page.click('.agent-tabs button:nth-child(4)');
      await page.click('.agent-actions .agent-primary');
      await page.waitForFunction(() =>
        document
          .querySelector('.agent-records')
          ?.textContent.includes('Nenhuma aprovação pendente'),
      );
      assert.ok(
        await page.evaluate(() =>
          window.__agentActions.some(
            (a) => a.action === 'approval' && a.decision === 'approve',
          ),
        ),
      );
      await page.click('.agent-tabs button:first-child');
      await page.click('[aria-label="Gravar áudio"]');
      await page.waitForSelector('[aria-label="Concluir gravação"]');
      await new Promise((resolve) => setTimeout(resolve, 1200));
      await page.click('[aria-label="Concluir gravação"]');
      await page.waitForFunction(() =>
        document
          .querySelector('.agent-composer textarea')
          .value.includes('Pergunta ditada'),
      );
      await page.setViewport({
        width: 390,
        height: 420,
        isMobile: true,
        hasTouch: true,
      });
      await page.waitForFunction(
        () =>
          document.querySelector('.agent-composer').getBoundingClientRect()
            .bottom <=
          window.innerHeight + 2,
      );
      assert.ok(
        await page.$eval(
          '.agent-composer',
          (e) => e.getBoundingClientRect().bottom <= window.innerHeight + 2,
        ),
      );
      await page.screenshot({
        path: '.audit_screenshots/central-keyboard.png',
      });
      await page.evaluate(() => {
        window.__failCentral = true;
      });
      await page.click('[aria-label="Enviar mensagem"]');
      await page.waitForSelector('[role="alert"]');
      assert.match(
        await page.$eval('.agent-composer textarea', (e) => e.value),
        /Pergunta ditada/,
      );
      await page.click('.agent-topbar [aria-label="Menu principal"]');
      assert.equal(await page.evaluate(() => window.__menuOpened), true);
      assert.deepEqual(errors, []);
    } finally {
      await browser?.close();
      await server.close();
    }
  },
);

mkdirSync('.audit_screenshots', { recursive: true });
