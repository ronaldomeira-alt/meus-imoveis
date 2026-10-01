// ==============================================================================
// EXECUTOR REAL DO BOT CAPTADOR — WINDOWS LOCAL (CUSTO R$ 0,00)
// Conecta cirurgicamente ao Chrome do usuário via DevToolsActivePort,
// preservando o navegador e todas as abas pessoais intactas.
// ==============================================================================

import { readFileSync, existsSync } from 'node:fs';
import puppeteer from 'puppeteer-core';
import { createClient } from '@supabase/supabase-js';
import { renderMessageTemplate } from '../src/lib/bot-captador/engine.ts';

// Carrega variáveis do .env usando o método nativo do Node.js
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Variáveis de ambiente do Supabase não configuradas.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/**
 * Lê o WebSocket endpoint ativo do Google Chrome do usuário
 */
function getChromeWsEndpoint() {
  const localAppData = process.env.LOCALAPPDATA;
  if (!localAppData) throw new Error('Variável LOCALAPPDATA não encontrada.');
  const portFile = `${localAppData}\\Google\\Chrome\\User Data\\DevToolsActivePort`;
  if (!existsSync(portFile)) {
    throw new Error(`Arquivo DevToolsActivePort não encontrado em ${portFile}. O Chrome precisa estar rodando com depuração remota ativada.`);
  }
  const lines = readFileSync(portFile, 'utf8').trim().split(/\r?\n/);
  const port = lines[0];
  const path = lines[1];
  return `ws://127.0.0.1:${port}${path}`;
}

/**
 * Função utilitária para conectar ao Chrome com desconexão segura
 */
async function withChrome(action) {
  const wsUrl = getChromeWsEndpoint();
  console.log(`🔌 Conectando ao Chrome via WebSocket (${wsUrl})...`);
  const browser = await puppeteer.connect({
    browserWSEndpoint: wsUrl,
    defaultViewport: null,
  });
  console.log('✅ Conectado ao Google Chrome com sucesso.');

  try {
    return await action(browser);
  } finally {
    browser.disconnect();
    console.log('🔌 Desconectado do Google Chrome (processo e abas intactas).');
  }
}

/**
 * Normaliza e gera fingerprint do anúncio (espelha engine.ts)
 */
function generateFingerprint(ad) {
  const normNeigh = (ad.neighborhood || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

  const normBed = ad.bedrooms != null ? `${ad.bedrooms}q` : '0q';
  const normArea = ad.areaM2 != null ? `${Math.round(ad.areaM2 / 3) * 3}m` : '0m';
  const normPrice = ad.price ? `${Math.round(ad.price / 5000) * 5000}p` : '0p';

  const cleanTitle = (ad.title || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['com', 'para', 'apartamento', 'apto'].includes(w))
    .slice(0, 4)
    .join('');

  return `${ad.campaignType}_${normNeigh}_${normBed}_${normArea}_${normPrice}_${cleanTitle}`;
}

/**
 * MODO 1: SCAN REAL DA OLX (SOMENTE LEITURA — ZERO MENSAGENS)
 */
async function runRealScan() {
  console.log('📡 Buscando conta e campanhas ativas no Supabase...');
  const { data: accounts } = await supabase.from('accounts').select('id').limit(1);
  if (!accounts || accounts.length === 0) {
    console.error('❌ Nenhuma conta encontrada no Supabase.');
    return;
  }
  const accountId = accounts[0].id;

  const { data: campaigns } = await supabase
    .from('bot_campaigns')
    .select('*')
    .eq('account_id', accountId)
    .eq('is_active', true);

  if (!campaigns || campaigns.length === 0) {
    console.log('ℹ️ Nenhuma campanha ativa no momento.');
    return;
  }

  // Busca tombstones existentes para garantir não duplicação
  const { data: tombstones } = await supabase
    .from('bot_capture_tombstones')
    .select('fingerprint')
    .eq('account_id', accountId);

  const tombstoneSet = new Set((tombstones || []).map((t) => t.fingerprint));

  console.log(`🔒 ${tombstoneSet.size} tombstones perpétuos ativos no banco.`);

  await withChrome(async (browser) => {
    for (const campaign of campaigns) {
      console.log(`\n🔍 Executando descoberta real para campanha: ${campaign.type.toUpperCase()}`);
      const isVenda = campaign.type === 'venda';
      const categoryPath = isVenda ? 'venda' : 'aluguel';
      let searchUrl = `https://www.olx.com.br/imoveis/${categoryPath}/estado-pb/joao-pessoa?f=p`;
      if (campaign.min_price) searchUrl += `&ps=${Math.round(campaign.min_price)}`;
      if (campaign.max_price) searchUrl += `&pe=${Math.round(campaign.max_price)}`;

      console.log('🌐 Abrindo aba temporária em background:', searchUrl);
      const page = await browser.newPage();

      try {
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });

        const rawAds = await page.evaluate(() => {
          const links = Array.from(document.querySelectorAll('a'))
            .filter((a) => a.href.includes('/imoveis/') && a.href.match(/-\d{9,12}$/));

          const results = [];
          const seen = new Set();

          links.forEach((a) => {
            const container = a.closest('li') || a.closest('section') || a.parentElement;
            if (!container) return;
            const text = container.innerText || '';
            const matchId = a.href.match(/-(\d{9,12})$/);
            const listId = matchId ? matchId[1] : null;
            if (!listId || seen.has(listId)) return;
            seen.add(listId);

            const priceMatch = text.match(/R\$\s*([\d\.]+)/);
            const price = priceMatch ? Number(priceMatch[1].replace(/\./g, '')) : null;

            const bedMatch = text.match(/(\d+)\s*quarto/i);
            const bedrooms = bedMatch ? Number(bedMatch[1]) : null;

            const areaMatch = text.match(/(\d+)\s*m²/i);
            const areaM2 = areaMatch ? Number(areaMatch[1]) : null;

            // Extrai localização (Cidade, Bairro)
            const locMatch = text.match(/([A-Za-zÀ-ÖØ-öø-ÿ\s]+),\s*([A-Za-zÀ-ÖØ-öø-ÿ\s]+)/i);
            let city = '';
            let neighborhood = '';
            if (locMatch) {
              city = locMatch[1].trim();
              neighborhood = locMatch[2].split('\n')[0].trim();
            }

            const isPro =
              text.toLowerCase().includes('profissional') ||
              text.toLowerCase().includes('creci') ||
              text.toLowerCase().includes('imobiliária');

            // Detecta se anúncio é de fora da região metropolitana alvo
            const isOutsideRegion =
              text.toLowerCase().includes('parnamirim') ||
              text.toLowerCase().includes('rn') ||
              text.toLowerCase().includes('natal') ||
              a.href.toLowerCase().includes('parnamirim');

            results.push({
              listId,
              url: a.href,
              title: a.innerText.split('\n')[0].trim(),
              price,
              bedrooms,
              areaM2,
              city,
              neighborhood,
              isOutsideRegion,
              isPrivate: !isPro,
              textSnippet: text.replace(/\n+/g, ' · ').slice(0, 150),
            });
          });

          return results;
        });

        console.log(`📋 Total de anúncios analisados na página da OLX: ${rawAds.length}`);

        // Busca captações existentes para validação de duplicidade
        const { data: existingCaptures } = await supabase
          .from('bot_captures')
          .select('id, external_id, normalized_url, fingerprint, neighborhood, bedrooms, price, owner_name, owner_contact')
          .eq('account_id', accountId);

        const existingList = existingCaptures || [];
        const existingExternalIds = new Set(existingList.map((e) => e.external_id).filter(Boolean));
        const existingNormalizedUrls = new Set(existingList.map((e) => e.normalized_url));
        const existingFingerprints = new Set(existingList.map((e) => e.fingerprint));

        let newEnqueued = 0;
        let rejectedLocationCount = 0;
        let rejectedNonPrivateCount = 0;
        let duplicateCount = 0;
        let possibleDuplicateCount = 0;
        let eligibleCount = 0;

        for (const ad of rawAds) {
          // Descarta anúncios sem título válido
          if (!ad.title || ad.title.trim().length < 5) {
            continue;
          }

          // 1. FILTRO PARTICULAR (Requisito Absoluto)
          if (!ad.isPrivate) {
            rejectedNonPrivateCount++;
            continue;
          }

          // 2. FILTRO GEOGRÁFICO E DE BAIRROS (Requisito Estrito)
          if (ad.isOutsideRegion) {
            rejectedLocationCount++;
            continue;
          }

          if (campaign.neighborhoods?.length > 0) {
            // Anúncio sem bairro identificado NUNCA entra na fila
            if (!ad.neighborhood || ad.neighborhood.trim() === '') {
              rejectedLocationCount++;
              continue;
            }

            const adNeighNorm = ad.neighborhood.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
            const matchesNeigh = campaign.neighborhoods.some((n) =>
              adNeighNorm.includes(n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())
            );

            if (!matchesNeigh) {
              rejectedLocationCount++;
              continue;
            }
          }

          // 3. DEDUPLICAÇÃO EM MÚLTIPLAS CAMADAS
          const normalizedUrl = ad.url.split('?')[0];
          const fingerprint = generateFingerprint({ ...ad, campaignType: campaign.type });

          // Camada 3: Verificação contra Tombstones Perpétuos (NUNCA reabordar)
          if (tombstoneSet.has(fingerprint)) {
            duplicateCount++;
            continue;
          }

          // Camada 1: ID Externo já existente
          if (existingExternalIds.has(ad.listId)) {
            duplicateCount++;
            continue;
          }

          // Camada 2: URL Canonicalizada já existente
          if (existingNormalizedUrls.has(normalizedUrl)) {
            duplicateCount++;
            continue;
          }

          // Camada 3: Fingerprint já existente no banco
          if (existingFingerprints.has(fingerprint)) {
            duplicateCount++;
            continue;
          }

          // Camada 4: Possível Duplicidade (mesmo anunciante e mesmo bairro com atributos compatíveis)
          const isPossibleDup = existingList.some((e) => {
            const sameNeighborhood = e.neighborhood && ad.neighborhood &&
              e.neighborhood.toLowerCase().trim() === ad.neighborhood.toLowerCase().trim();
            const samePrice = e.price && ad.price && Math.abs(e.price - ad.price) <= 5000;
            const sameBedrooms = e.bedrooms != null && ad.bedrooms != null && e.bedrooms === ad.bedrooms;
            return sameNeighborhood && samePrice && sameBedrooms;
          });

          if (isPossibleDup) {
            possibleDuplicateCount++;
            // Salva como POSSIBLE_DUPLICATE para auditoria humana, NUNCA entra em QUEUED para envio
            await supabase.from('bot_captures').insert({
              account_id: accountId,
              campaign_type: campaign.type,
              provider: 'olx',
              external_id: ad.listId,
              url: ad.url,
              normalized_url: normalizedUrl,
              fingerprint,
              title: ad.title,
              price: ad.price,
              neighborhood: ad.neighborhood || null,
              bedrooms: ad.bedrooms || null,
              area_m2: ad.areaM2 || null,
              status: 'POSSIBLE_DUPLICATE',
              rejection_reason: 'Possível duplicado: características idênticas no mesmo bairro',
            });
            continue;
          }

          // Imóvel efetivamente elegível!
          eligibleCount++;

          // Tenta inserir na fila QUEUED
          const { error: insErr } = await supabase.from('bot_captures').insert({
            account_id: accountId,
            campaign_type: campaign.type,
            provider: 'olx',
            external_id: ad.listId,
            url: ad.url,
            normalized_url: normalizedUrl,
            fingerprint,
            title: ad.title,
            price: ad.price,
            neighborhood: ad.neighborhood || null,
            bedrooms: ad.bedrooms || null,
            area_m2: ad.areaM2 || null,
            status: 'QUEUED',
          });

          if (!insErr) {
            newEnqueued++;
            console.log(`  ➕ Novo anúncio enfileirado: "${ad.title}" (${ad.neighborhood}) - R$ ${ad.price}`);
          } else {
            duplicateCount++;
          }
        }

        console.log(`\n📊 Relatório Completo de Descoberta (${campaign.type.toUpperCase()}):`);
        console.log(`   - Encontrados na OLX: ${rawAds.length}`);
        console.log(`   - Rejeitados por Localização: ${rejectedLocationCount}`);
        console.log(`   - Rejeitados por Não Serem Particulares: ${rejectedNonPrivateCount}`);
        console.log(`   - Duplicados (Tombstone / ID / URL / Fingerprint): ${duplicateCount}`);
        console.log(`   - Possíveis Duplicados (POSSIBLE_DUPLICATE): ${possibleDuplicateCount}`);
        console.log(`   - Efetivamente Elegíveis: ${eligibleCount}`);
        console.log(`   - Novos em QUEUED: ${newEnqueued}`);
        console.log(`   - Mensagens enviadas: 0 (SOMENTE LEITURA — ZERO DISPAROS)\n`);
      } finally {
        await page.close();
      }
    }
  });
}

/**
 * MODO 2: DETECÇÃO DE RESPOSTAS NO CHAT DA OLX
 */
async function checkChatResponses() {
  console.log('📡 Buscando captações com status WAITING_RESPONSE no Supabase...');
  const { data: waiting } = await supabase
    .from('bot_captures')
    .select('id, external_id, title')
    .eq('status', 'WAITING_RESPONSE')
    .not('external_id', 'is', null);

  if (!waiting || waiting.length === 0) {
    console.log('ℹ️ Nenhuma captação aguardando resposta no momento.');
    return;
  }

  const waitingMap = new Map();
  waiting.forEach((w) => waitingMap.set(w.external_id, w.id));

  console.log(`🔎 Verificando respostas para ${waiting.length} captação(ões) ativa(s)...`);

  await withChrome(async (browser) => {
    const page = await browser.newPage();
    try {
      await page.goto('https://chat.olx.com.br/', { waitUntil: 'domcontentloaded', timeout: 30000 });

      // Lê as conversas recentes da lista de chats
      const chats = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('a, li, div[role="button"]'));
        const found = [];
        items.forEach((item) => {
          const text = item.innerText || '';
          const href = (item.getAttribute('href') || '');
          const matchId = href.match(/list-id=(\d+)/) || text.match(/(\d{9,12})/);
          if (matchId) {
            found.push({
              listId: matchId[1],
              snippet: text.replace(/\n+/g, ' ').slice(0, 100),
            });
          }
        });
        return found;
      });

      console.log(`📥 ${chats.length} conversas localizadas na caixa de entrada da OLX.`);

      let updatedCount = 0;
      for (const chat of chats) {
        if (waitingMap.has(chat.listId)) {
          const captureId = waitingMap.get(chat.listId);
          console.log(`  🎉 Resposta identificada para o anúncio ${chat.listId}!`);
          await supabase
            .from('bot_captures')
            .update({
              status: 'RESPONDED',
              responded_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', captureId);
          updatedCount++;
        }
      }

      console.log(`✅ Detecção concluída: ${updatedCount} captações atualizadas para RESPONDEU.`);
    } finally {
      await page.close();
    }
  });
}

/**
 * MODO 3: ENVIO UNITÁRIO CONTROLADO (1 ANÚNCIO REAL / EXIGE AUTORIZAÇÃO EXPLÍCITA)
 */
async function sendSingleApproach(targetCaptureId) {
  if (!targetCaptureId) {
    console.error('❌ ID da captação não informado. Use: --single-send <capture_id>');
    return;
  }

  console.log(`📡 Buscando captação no Supabase: ${targetCaptureId}...`);
  const { data: capture, error: capErr } = await supabase
    .from('bot_captures')
    .select('*')
    .eq('id', targetCaptureId)
    .single();

  if (capErr || !capture) {
    console.error('❌ Captação não encontrada no banco:', capErr?.message);
    return;
  }

  if (capture.status !== 'QUEUED') {
    console.error(`❌ Captação não está em estado QUEUED (Status atual: ${capture.status}). Abortando.`);
    return;
  }

  // Verifica se o anúncio já tem tombstone ativo (Proteção Absoluta)
  const { data: tombstone } = await supabase
    .from('bot_capture_tombstones')
    .select('id')
    .eq('account_id', capture.account_id)
    .eq('fingerprint', capture.fingerprint)
    .maybeSingle();

  if (tombstone) {
    console.error('❌ REGRA ABSOLUTA: Este imóvel já possui Tombstone ativo e NUNCA pode receber segunda abordagem!');
    return;
  }

  // Seleciona um template de mensagem cadastrado
  const { data: templates } = await supabase
    .from('bot_message_templates')
    .select('*')
    .eq('account_id', capture.account_id)
    .order('created_at', { ascending: true });

  if (!templates || templates.length === 0) {
    console.error('❌ Nenhuma mensagem de abordagem cadastrada no banco.');
    return;
  }

  const selectedTemplate = templates[0];
  console.log(`📝 Mensagem selecionada: "${selectedTemplate.title}"`);
  console.log(`💬 Conteúdo: "${selectedTemplate.content}"`);

  const chatUrl = `https://chat.olx.com.br/?list-id=${capture.external_id}`;
  console.log(`🌐 Acessando chat oficial do anúncio: ${chatUrl}`);

  await withChrome(async (browser) => {
    const page = await browser.newPage();
    try {
      await page.goto(chatUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });
      await new Promise((r) => setTimeout(r, 4000));

      // Extrai informações da tela de chat
      const chatInfo = await page.evaluate(() => {
        const textarea = document.querySelector('textarea, [contenteditable="true"]');
        const placeholder = textarea ? (textarea.getAttribute('placeholder') || '') : '';
        const bodyText = document.body.innerText || '';
        const isLogged = bodyText.includes('ronaldomeira') || bodyText.includes('Meus Anúncios');
        return {
          hasInput: Boolean(textarea),
          placeholder,
          isLogged,
        };
      });

      if (!chatInfo.isLogged) {
        console.error('❌ Sessão do usuário não está autenticada na OLX. Marcar ATENÇÃO: LOGIN NECESSÁRIO.');
        return;
      }

      if (!chatInfo.hasInput) {
        console.error('❌ Campo de chat não encontrado na página. Possível anúncio inativo ou bloqueado.');
        return;
      }

      console.log(`👤 Proprietário detectado no chat: ${chatInfo.placeholder || 'Não especificado'}`);

      // Atualiza nome do proprietário na captação se identificado no placeholder
      const ownerNameMatch = chatInfo.placeholder.match(/Responder\s+([A-Za-zÀ-ÖØ-öø-ÿ\s]+)/i);
      if (ownerNameMatch) {
        const detectedName = ownerNameMatch[1].trim();
        await supabase
          .from('bot_captures')
          .update({ owner_name: detectedName })
          .eq('id', capture.id);
        console.log(`✅ Nome do proprietário salvo no Supabase: ${detectedName}`);
      }

      // Preenche a mensagem no textarea garantindo fidelidade absoluta ao texto cadastrado (sem interpolação dinâmica na v1)
      const messageToSend = renderMessageTemplate(selectedTemplate.content, {}, { interpolateVariables: false });
      console.log('✍️ Preenchendo mensagem no chat da OLX:', messageToSend);
      await page.focus('textarea, [contenteditable="true"]');
      await page.keyboard.type(messageToSend, { delay: 25 });

      console.log('🚀 Disparando envio no chat...');
      // Pressiona Enter para enviar
      await page.keyboard.press('Enter');
      await new Promise((r) => setTimeout(r, 3000));

      // Verificação de entrega no DOM
      const deliveryVerified = await page.evaluate((msgText) => {
        const body = document.body.innerText || '';
        return body.includes(msgText.slice(0, 30));
      }, selectedTemplate.content);

      if (deliveryVerified) {
        console.log('🎉 ENVIO CONFIRMADO COM SUCESSO NO CHAT DA OLX!');
        // Atualiza status atômico e grava Tombstone perpétuo
        const { data: confirmed } = await supabase.rpc('confirm_bot_capture_contacted', {
          p_capture_id: capture.id,
          p_message_snapshot: selectedTemplate.content,
        });

        if (confirmed) {
          console.log('🔒 Status atualizado para WAITING_RESPONSE e Tombstone perpétuo gravado no Supabase.');
        }
      } else {
        console.warn('⚠️ Não foi possível confirmar visualmente o envio da mensagem. Marcando para revisão humana.');
        await supabase
          .from('bot_captures')
          .update({
            status: 'FAILED',
            rejection_reason: 'Envio não confirmado visualmente no chat da OLX',
          })
          .eq('id', capture.id);
      }
    } finally {
      await page.close();
    }
  });
}

/**
 * CLI DISPATCHER
 */
const arg = process.argv[2];

if (arg === '--scan') {
  runRealScan().catch((err) => {
    console.error('❌ Falha na execução do scan:', err);
    process.exit(1);
  });
} else if (arg === '--check-responses') {
  checkChatResponses().catch((err) => {
    console.error('❌ Falha na verificação de respostas:', err);
    process.exit(1);
  });
} else if (arg === '--single-send') {
  sendSingleApproach(process.argv[3]).catch((err) => {
    console.error('❌ Falha no envio unitário:', err);
    process.exit(1);
  });
} else {
  console.log(`
Uso do Executor Real:
  node --use-system-ca scripts/olx-executor.mjs --scan
    -> Executa busca real de anúncios na OLX usando os filtros da campanha e enfileira (ZERO mensagens).

  node --use-system-ca scripts/olx-executor.mjs --check-responses
    -> Acessa a caixa de entrada do chat da OLX e identifica respostas recebidas.

  node --use-system-ca scripts/olx-executor.mjs --single-send <capture_id>
    -> Executa UMA ÚNICA abordagem real no anúncio selecionado com confirmação e gravação de Tombstone.
`);
}
