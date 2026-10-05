import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';
import { BUILTINS } from '../supabase/functions/_shared/central-bots/core.js';
import { TOOL_CATALOG } from '../supabase/functions/_shared/central-bots/tools.js';
import { DEFAULTS, PROFILE } from '../supabase/functions/_shared/bot-marketing/core.js';

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
const marketing = ${JSON.stringify({
  settings: { enabled: false, paused: false, config: DEFAULTS, profile: PROFILE, next_research_at: now, last_cycle_at: null, last_error: null },
  ideas: [{ id: 'idea-fixture', topic: 'Pauta de teste no Bessa', angle: 'Rotina do bairro', status: 'proposed', created_at: now, delivered_at: now, draft_id: null, proposal: { message: 'Ronaldo, esta é uma ideia de teste, com evidência fictícia isolada.', why_now: 'Cenário de teste', fit: 'Contexto de teste', format: 'Vídeo', hook: 'Conhecer o bairro', practical: 'Mostrar o trajeto', effort: 'Gravação curta', limits: 'Fixture local; não é pesquisa real.', evidence: [{ id: 'evidence-fixture', url: 'https://www.gov.br/teste', quote: 'Citação fictícia para testar a interface.', published_at: now, observed_at: now }] } }],
  memory: [{ id: 'memory-fixture', kind: 'fact', nature: 'observed', topic: 'Bessa', state: 'active', data: { claim: 'Memória fictícia de teste', url: 'https://www.gov.br/teste' }, updated_at: now }],
  sources: [{ id: 'source-fixture', url: 'https://www.gov.br/teste', identity: 'Fonte fictícia', access_status: 'unknown', last_checked_at: null, limits: 'Fixture local', trust: 'unreviewed' }],
  tasks: [], capabilities: { search: false, instagram_binding: false, media_analysis: false, server_enabled: true },
})};
const messages = {};
const technical = {enabled:true,runners:[{id:'runner-fixture',enabled:true,state:'ready',last_seen_at:new Date().toISOString()}],jobs:[]};
window.__agentActions = [];
export const CENTRAL_BOTS_ENABLED = true;
export async function audioBase64() { return 'test-audio'; }
export async function centralRequest(body,signal,onText) {
  window.__agentActions.push(body);
  if (window.__failCentral) throw new Error('Falha simulada de conexão');
  if (body.action === 'list') return structuredClone(data);
  if (body.action === 'technical') {
    if(body.operation==='list')return structuredClone(technical);
    if(body.operation==='create')technical.jobs.push({id:'job-fixture',incident_id:body.incident_id,status:'queued',created_at:new Date().toISOString(),progress:'Aguardando o Antigravity conectado.'});
    if(body.operation==='cancel')Object.assign(technical.jobs.find(j=>j.id===body.job_id),{status:'cancelled',progress:'Investigação cancelada por você.'});
    return {};
  }
  if (body.action === 'marketing') {
    if(body.operation==='panel') return structuredClone(marketing);
    if(body.operation==='feedback') marketing.ideas.find(i=>i.id===body.idea_id).status=body.status||'saved';
    if(body.operation==='settings') { Object.assign(marketing.settings.config,body.settings); if('enabled' in body.settings)marketing.settings.enabled=body.settings.enabled; if('paused' in body.settings)marketing.settings.paused=body.settings.paused; }
    if(body.operation==='profile') Object.assign(marketing.settings.profile,body.profile);
    if(body.operation==='draft') marketing.ideas.find(i=>i.id===body.idea_id).draft_id='draft-fixture';
    if(body.operation==='memory_correct') marketing.memory.find(m=>m.id===body.memory_id).data.correction=body.correction;
    if(body.operation==='memory_delete') marketing.memory=marketing.memory.filter(m=>m.id!==body.memory_id);
    return {saved:true};
  }
  if (body.action === 'conversation') return { conversation_id: body.bot_id, messages: messages[body.bot_id] || [], runs: [], events: [] };
  if (body.action === 'chat') {
    onText?.('Consulta ');await new Promise(resolve=>setTimeout(resolve,300));onText?.('Consulta de teste ');await new Promise(resolve=>setTimeout(resolve,300));
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
        'Bot Gestor,Bot Captador,Bot Sentinela,Bot de Marketing',
      );
      await page.type('.agent-composer textarea', 'Quantos contatos existem?');
      await page.click('[aria-label="Enviar mensagem"]');
      await page.waitForFunction(()=>{const reply=document.querySelector('[aria-label="Resposta em andamento"] p');return reply&&reply.textContent.length>0&&reply.textContent.length<38;});
      assert.equal(await page.$('.agent-message-meta'),null);
      assert.equal(await page.$eval('.agent-composer textarea',el=>el.hasAttribute('placeholder')),false);
      const appearance=await page.$eval('.agent-message-user',el=>({background:getComputedStyle(el).backgroundColor,radius:parseFloat(getComputedStyle(el).borderRadius)}));
      assert.equal(appearance.background,'rgb(23, 62, 116)');assert.ok(appearance.radius>=20);
      const centered=await page.$eval('.agent-composer-row',el=>{const row=el.getBoundingClientRect();return [...el.querySelectorAll('button')].every(button=>{const rect=button.getBoundingClientRect();return Math.abs((rect.top+rect.bottom-row.top-row.bottom)/2)<2;});});assert.equal(centered,true);
      await page.waitForFunction(()=>[...document.querySelectorAll('.agent-message-assistant')].some(el=>el.textContent.includes('Consulta de teste concluída')));
      await page.waitForFunction(()=>!document.querySelector('[aria-label="Resposta em andamento"]'));
      assert.match(
        await page.$eval('.agent-message-assistant', (e) => e.textContent),
        /3 contatos/,
      );
      await page.click('.agent-message details summary');
      assert.equal(await page.$eval('.agent-source details', e=>e.open),false);
      assert.equal(await page.$eval('.agent-source pre', e=>e.checkVisibility()),false);
      await page.click('.agent-source details summary');
      assert.match(
        await page.$eval('.agent-source', (e) => e.textContent),
        /fixture/,
      );
      await page.click('.agent-bot-item:nth-child(4)');
      await page.waitForFunction(() => document.querySelector('.agent-topbar h2')?.textContent==='Bot de Marketing');
      assert.ok(await page.$('.agent-topbar .agent-avatar svg'));
      await page.click('.agent-tabs button:nth-child(2)');
      await page.waitForSelector('.marketing-card');
      await page.evaluate(() => [...document.querySelectorAll('.marketing-card button')].find(b=>b.textContent==='Aprovar ideia').click());
      await page.waitForFunction(() => window.__agentActions.some(a=>a.operation==='feedback'&&a.status==='approved'));
      assert.ok(await page.evaluate(() => !window.__agentActions.some(a=>/publish|schedule_post/.test(a.operation||''))));
      await page.click('.agent-tabs button:nth-child(3)');
      await page.waitForFunction(() => document.querySelector('.marketing-panel')?.textContent.includes('Perfil editorial'));
      await page.type('.marketing-panel form textarea:nth-of-type(1)','');
      await page.evaluate(() => [...document.querySelectorAll('.marketing-panel button')].find(b=>b.textContent==='Corrigir perfil').click());
      await page.waitForFunction(() => window.__agentActions.some(a=>a.operation==='profile'));
      await page.click('.agent-tabs button:nth-child(4)');
      await page.waitForFunction(() => document.querySelector('.marketing-panel')?.textContent.includes('Fonte fictícia'));
      await page.screenshot({path:'.audit_screenshots/marketing-desktop.png'});
      await page.click('.agent-tabs button:nth-child(5)');
      await page.waitForFunction(() => document.querySelector('.marketing-panel')?.textContent.includes('Pesquisa e avisos'));
      await page.evaluate(() => [...document.querySelectorAll('.marketing-state button')].find(b=>b.textContent==='Pausar').click());
      await page.waitForFunction(() => document.querySelector('.marketing-state button')?.textContent==='Retomar');
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
        () => document.querySelectorAll('.agent-bot-item').length === 5,
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
      await page.click('.agent-tabs button:nth-child(5)');
      await page.waitForFunction(()=>document.querySelector('.agent-records')?.textContent.includes('Antigravity conectado e disponível'));
      assert.equal(await page.$('.agent-composer'),null,'Investigation does not open the chat composer');
      await page.click('.agent-records .agent-primary');
      await page.waitForFunction(()=>document.querySelector('.agent-incident')?.textContent.includes('Na fila'));
      assert.equal(await page.$eval('.agent-records .agent-primary',button=>button.disabled),true,'Duplicate human dispatch disabled');
      assert.ok(await page.evaluate(()=>window.__agentActions.some(a=>a.action==='technical'&&a.operation==='create'&&a.incident_id==='incident-fixture'&&a.request_id)));
      const investigationOverflow=await page.evaluate(()=>[...document.querySelectorAll('.agent-main,.agent-records,.agent-incident')].some(e=>e.scrollWidth>e.clientWidth+2));
      assert.equal(investigationOverflow,false,'Investigation fits mobile');
      await page.click('.agent-incident button');
      await page.waitForFunction(()=>document.querySelector('.agent-incident')?.textContent.includes('Cancelada'));
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
      // Marketing is verified at mobile/PWA sizes with the same shared workspace.
      await page.setViewport({width:320,height:844,isMobile:true,hasTouch:true});
      await page.click('button[aria-label="Meus bots"]');
      await page.click('.agent-bot-item:nth-child(4)');
      await page.click('.agent-tabs button:nth-child(5)');
      await page.waitForSelector('.marketing-panel input[type=number]');
      assert.equal(await page.evaluate(() => [...document.querySelectorAll('.marketing-panel,.marketing-card,.agent-main')].some(e=>e.scrollWidth>e.clientWidth+2)),false);
      await page.screenshot({path:'.audit_screenshots/marketing-mobile-320.png'});
      await page.click('.agent-tabs button:first-child');
      await page.type('.agent-composer textarea','Pergunta ditada');
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
