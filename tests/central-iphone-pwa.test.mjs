import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdirSync} from 'node:fs';
import {createServer} from 'vite';
import puppeteer from 'puppeteer-core';
import {BUILTINS} from '../supabase/functions/_shared/central-bots/core.js';
const data={bots:BUILTINS.map((b,i)=>({...b,id:`fixture-${i}`,active:true})),previews:{'fixture-0':{role:'assistant',content:'Vamos conferir seus bots.',created_at:'2026-10-04T12:30:00Z'}},approvals:[],incidents:[],settings:{enabled:true},provider_configured:true,tools:[]};
const iphone='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1';
test('iPhone PWA: choose faces before chat, switch/re-enter, deep links, safe areas and keyboard; Safari/desktop unchanged',{timeout:60000},async()=>{
  const server=await createServer({configFile:false,cacheDir:'.audit_screenshots/iphone-pwa-cache',oxc:{jsx:{runtime:'automatic'}},server:{port:0,host:'127.0.0.1'},plugins:[{
    name:'isolated-iphone-pwa',enforce:'pre',resolveId(id){if(id==='/__iphone_entry.js')return '\0iphone-entry';},
    load(id){
      if(id.replaceAll('\\','/').endsWith('/src/lib/central-bots.ts'))return `const data=${JSON.stringify(data)};const messages={};window.__calls=[];export async function centralRequest(body){window.__calls.push(body);if(body.action==='list')return data;if(body.action==='conversation')return{messages:messages[body.bot_id]||[],runs:[],events:[]};if(body.action==='chat'){messages[body.bot_id]=[{id:'answer',role:'assistant',content:'Resposta de teste',sources:[]}];return{};}return{};}export async function audioBase64(){return '';}`;
      if(id==='\0iphone-entry')return `import React from'react';import{createRoot}from'react-dom/client';import Central from'/src/components/agents/CentralBotsView.tsx';import'/src/index.css';createRoot(document.getElementById('root')).render(React.createElement('main',{className:'app-main h-full overflow-hidden'},React.createElement(Central,{onOpenMenu:()=>{},onOpenCaptador:()=>{}})));`;
    },configureServer(vite){vite.middlewares.use('/__iphone_test',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html class="dark"><head><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body class="h-screen overflow-hidden"><div id="root" class="h-full"></div><script type="module" src="/__iphone_entry.js"></script></body></html>');});},
  }],optimizeDeps:{include:['react','react-dom/client','lucide-react']}});
  let browser;
  try {
    await server.listen();browser=await puppeteer.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,pipe:true});
    const page=await browser.newPage();await page.setUserAgent(iphone);await page.setViewport({width:390,height:844,isMobile:true,hasTouch:true});
    await page.evaluateOnNewDocument(()=>Object.defineProperty(navigator,'standalone',{value:true,configurable:true}));
    const url=`http://127.0.0.1:${server.httpServer.address().port}/__iphone_test`;
    await page.goto(url);await page.waitForSelector('.agent-picker-card');
    assert.equal(await page.$$eval('.agent-picker-card',items=>items.length),4);
    assert.equal(await page.$('.agent-composer'),null);
    assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c.action==='conversation').length),0);
    assert.equal(await page.$eval('.agent-inbox-preview',e=>e.textContent),'Vamos conferir seus bots.');
    assert.equal(await page.$('.agent-picker h3'),null);
    assert.equal(await page.$eval('.agent-picker-card',e=>getComputedStyle(e).borderTopWidth),'0px');
    assert.ok(await page.$$eval('.agent-picker-card .agent-avatar',nodes=>nodes.every(e=>getComputedStyle(e).backgroundImage==='none'&&e.querySelector('svg'))));
    await page.click('[aria-label="Buscar bots"]');await page.type('[aria-label="Buscar bot pelo nome"]','Sentinela');
    assert.equal(await page.$$eval('.agent-picker-card',nodes=>nodes.length),1);
    await page.$eval('[aria-label="Buscar bot pelo nome"]',e=>{const setter=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set;setter.call(e,'');e.dispatchEvent(new Event('input',{bubbles:true}));});
    await page.waitForFunction(()=>document.querySelectorAll('.agent-picker-card').length===4);
    await page.click('[aria-label="Buscar bots"]');
    await page.click('[aria-label="Criar bot"]');await page.waitForSelector('.agent-modal');await page.click('[aria-label="Fechar"]');
    // Inject OS insets and keyboard dimensions; desktop engines have no notch.
    await page.addStyleTag({content:'.agent-workspace.agent-iphone-pwa{--agent-safe-top:59px;--agent-safe-bottom:34px}'});
    assert.ok(await page.$eval('.agent-topbar',e=>e.getBoundingClientRect().top>=59));
    mkdirSync('.audit_screenshots',{recursive:true});await page.screenshot({path:'.audit_screenshots/iphone-pwa-picker.png'});
    await page.click('.agent-picker-card');await page.waitForSelector('.agent-composer textarea');
    assert.equal(await page.$eval('.agent-topbar h2',e=>e.textContent),'Bot Gestor');
    await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{value:430,configurable:true});Object.defineProperty(visualViewport,'offsetTop',{value:80,configurable:true});visualViewport.dispatchEvent(new Event('resize'));visualViewport.dispatchEvent(new Event('scroll'));});
    assert.ok(await page.$eval('.agent-composer',e=>e.getBoundingClientRect().bottom<=511));
    assert.ok(await page.$eval('.agent-topbar',e=>e.getBoundingClientRect().top>=139));
    await page.type('.agent-composer textarea','Olá de teste');await page.click('[aria-label="Enviar mensagem"]');await page.waitForSelector('.agent-message-assistant');
    await page.evaluate(()=>{Object.defineProperty(visualViewport,'height',{value:844,configurable:true});Object.defineProperty(visualViewport,'offsetTop',{value:0,configurable:true});visualViewport.dispatchEvent(new Event('resize'));});
    await page.click('[aria-label="Escolher outro bot"]');await page.waitForSelector('.agent-picker-card');assert.equal(await page.$('.agent-composer'),null);
    await page.click('.agent-picker-card:nth-child(3)');await page.waitForSelector('.agent-composer');
    await page.evaluate(()=>window.dispatchEvent(new Event('central-bots-enter')));await page.waitForSelector('.agent-picker-card');
    await page.goto(`${url}?bot=marketing`);await page.waitForSelector('.agent-composer');assert.equal(await page.$('.agent-picker-card'),null);
    for(const width of [320,430,844]) {await page.setViewport({width,height:width===844?390:844,isMobile:true,hasTouch:true});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.ok(await page.$eval('[aria-label="Escolher outro bot"]',e=>e.getBoundingClientRect().width>0));}
    const safari=await browser.newPage();await safari.setUserAgent(iphone);await safari.setViewport({width:390,height:844,isMobile:true});await safari.goto(url);await safari.waitForSelector('.agent-composer');assert.equal(await safari.$('.agent-iphone-pwa'),null);
    const desktop=await browser.newPage();await desktop.setViewport({width:1440,height:900});await desktop.goto(url);await desktop.waitForSelector('.agent-composer');assert.equal(await desktop.$('.agent-picker-card'),null);
  }finally{await browser?.close();await server.close();}
});
