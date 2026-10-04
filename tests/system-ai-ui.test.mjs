import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import puppeteer from 'puppeteer-core';

test('global AI settings on desktop and mobile save one server config, keep keys masked and report real failures',{timeout:60000},async()=>{
  const fixture={provider:'groq',model:'openai/gpt-oss-120b',transcription_model:'whisper-large-v3-turbo',enabled:true,configured:true,can_manage:true,catalog:{deepinfra:{models:['openai/gpt-oss-120b','openai/gpt-oss-20b'],audioModels:['openai/whisper-large-v3-turbo']},groq:{models:['openai/gpt-oss-120b','openai/gpt-oss-20b'],audioModels:['whisper-large-v3-turbo']},gemini:{models:['gemini-2.5-flash'],audioModels:['gemini-2.5-flash']},openai:{models:['gpt-4.1-mini'],audioModels:['whisper-1']}}};
  const server=await createServer({configFile:false,cacheDir:'.audit_screenshots/system-ai-test-cache',oxc:{jsx:{runtime:'automatic'}},server:{port:0,host:'127.0.0.1'},plugins:[{
    name:'isolated-system-ai',enforce:'pre',resolveId(id){if(id==='/__ai_entry.js')return '\0ai-entry';},
    load(id){
      if(id.replaceAll('\\','/').endsWith('/src/lib/system-ai.ts'))return `let config=${JSON.stringify(fixture)};window.__calls=[];export async function requestSystemAI(body){window.__calls.push(body);if(body.action==='test'){if(window.__fail)throw Error('Provedor indisponível no teste');return {message:'Conexão confirmada: groq • openai/gpt-oss-20b.'};}if(body.action==='save'){config={...config,...body.config};delete config.api_key;}return structuredClone(config);}`;
      if(id==='\0ai-entry')return `import React from 'react';import{createRoot}from'react-dom/client';import{GlobalAISettings}from'/src/components/settings/GlobalAISettings.tsx';import'/src/index.css';createRoot(document.getElementById('root')).render(React.createElement(GlobalAISettings));`;
    },configureServer(vite){vite.middlewares.use('/__ai_test',(_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/__ai_entry.js"></script></body></html>');});},
  }],optimizeDeps:{include:['react','react-dom/client']}});
  let browser;
  try {
    await server.listen();browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true,pipe:true});
    const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
    for(const width of [1440,390]){
      await page.setViewport({width,height:900});await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/__ai_test`);await page.waitForSelector('[aria-label="Provedor"]');
      assert.equal(await page.$eval('[aria-label="Chave de API"]',e=>e.type),'password');
      assert.equal(await page.$eval('[aria-label="Chave de API"]',e=>e.value),'');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await page.select('[aria-label="Modelo de texto"]','openai/gpt-oss-20b');
      await page.evaluate(()=>localStorage.setItem('meus_imoveis_groq_key','obsolete-secret'));
      await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Salvar configuração').click());
      await page.waitForFunction(()=>document.querySelector('[role=status]')?.textContent.includes('salva'));
      assert.equal(await page.evaluate(()=>window.__calls.find(c=>c.action==='save').config.model),'openai/gpt-oss-20b');
      assert.equal(await page.evaluate(()=>localStorage.getItem('meus_imoveis_groq_key')),null);
      await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Testar configuração salva').click());
      await page.waitForFunction(()=>document.querySelector('[role=status]')?.textContent.includes('Conexão confirmada'));
      await page.evaluate(()=>{window.__fail=true;[...document.querySelectorAll('button')].find(b=>b.textContent==='Testar configuração salva').click();});
      await page.waitForSelector('[role=alert]');assert.match(await page.$eval('[role=alert]',e=>e.textContent),/indisponível/);
      await page.select('[aria-label="Provedor"]','deepinfra');
      assert.equal(await page.$eval('[aria-label="Modelo de texto"]',e=>e.value),'openai/gpt-oss-120b');
      assert.equal(await page.$eval('[aria-label="Modelo de transcrição"]',e=>e.value),'openai/whisper-large-v3-turbo');
      assert.equal(await page.$eval('[aria-label="Chave de API"]',e=>e.placeholder),'Informe a chave deste provedor');
      await page.type('[aria-label="Chave de API"]','synthetic-deepinfra-key-123456');
      await page.evaluate(()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Salvar configuração').click());
      await page.waitForFunction(()=>document.querySelector('[aria-label="Chave de API"]').value==='');
      assert.equal(await page.evaluate(()=>window.__calls.filter(c=>c.action==='save').at(-1).config.provider),'deepinfra');
      await page.select('[aria-label="Provedor"]','gemini');assert.equal(await page.$eval('[aria-label="Modelo de transcrição"]',e=>e.value),'gemini-2.5-flash');
    }
    assert.deepEqual(errors,[]);
  }finally{await browser?.close();await server.close();}
});
