// ==============================================================================
// PROCESSAMENTO REAL DA VARREDURA AO VIVO — AUDITORIA DE FILTROS E ELEGIBILIDADE
// Executa as regras de negócio em 4 camadas, sem envio de mensagens.
// ==============================================================================

import { readFileSync, existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import {
  evaluateAdEligibility,
  generatePropertyFingerprint,
  canonicalizeAdUrl,
} from '../src/lib/bot-captador/engine.ts';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function main() {
  console.log('📡 Carregando dados da varredura real...');
  const stepFile = 'C:/Users/ronal/.gemini/antigravity/brain/cc25a7eb-335c-4d00-8858-1559e9061f04/.system_generated/steps/506/output.txt';
  const fileContent = readFileSync(stepFile, 'utf8');

  // Extrai o bloco JSON
  const jsonMatch = fileContent.match(/```json\s*([\s\S]*?)\s*```/) || fileContent.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (!jsonMatch) {
    throw new Error('Bloco JSON não encontrado no output.');
  }

  const rawAds = JSON.parse(jsonMatch[1] || jsonMatch[0]);
  console.log(`📋 Total de anúncios brutos analisados: ${rawAds.length}`);

  // Busca conta
  const { data: accounts } = await supabase.from('accounts').select('id').limit(1);
  const accountId = accounts[0].id;

  // Busca campanha ativa
  const { data: campaigns } = await supabase
    .from('bot_campaigns')
    .select('*')
    .eq('account_id', accountId)
    .eq('is_active', true);

  const campaign = campaigns[0];
  console.log(`🎯 Campanha ativa: ${campaign.type.toUpperCase()}`);
  console.log(`📍 Bairros configurados: ${campaign.neighborhoods.join(', ')}`);
  console.log(`💰 Faixa de preço: R$ ${campaign.min_price?.toLocaleString('pt-BR')} até R$ ${campaign.max_price?.toLocaleString('pt-BR')}`);

  // Busca tombstones perpétuos
  const { data: tombstones } = await supabase
    .from('bot_capture_tombstones')
    .select('fingerprint')
    .eq('account_id', accountId);

  const tombstoneSet = new Set((tombstones || []).map((t) => t.fingerprint));

  // Busca captações existentes
  const { data: existingCaptures } = await supabase
    .from('bot_captures')
    .select('*')
    .eq('account_id', accountId);

  const existingList = existingCaptures || [];
  const existingMap = new Map();
  existingList.forEach((e) => {
    if (e.external_id) existingMap.set(e.external_id, e);
  });

  let totalEncontrados = rawAds.length;
  let rejeitadosLocalizacao = 0;
  let rejeitadosNaoParticulares = 0;
  let duplicados = 0;
  let possiveisDuplicados = 0;
  let efetivamenteElegiveis = 0;
  const novosEmQueued = [];
  const detalhesRejeicao = [];

  for (const ad of rawAds) {
    // Descarta se não tiver título
    if (!ad.title || ad.title.trim().length < 5) {
      rejeitadosLocalizacao++;
      detalhesRejeicao.push({ id: ad.listId, motivo: 'Título ausente ou inválido' });
      continue;
    }

    // 1. FILTRO PARTICULAR
    if (!ad.isPrivate) {
      rejeitadosNaoParticulares++;
      detalhesRejeicao.push({ id: ad.listId, title: ad.title, motivo: 'Anunciante Profissional / Imobiliária' });
      continue;
    }

    // 2. FILTRO GEOGRÁFICO / BAIRROS
    if (ad.isOutsideRegion) {
      rejeitadosLocalizacao++;
      detalhesRejeicao.push({ id: ad.listId, title: ad.title, motivo: `Fora da região metropolitana (${ad.city || ''} / ${ad.neighborhood || ''})` });
      continue;
    }

    if (campaign.neighborhoods && campaign.neighborhoods.length > 0) {
      if (!ad.neighborhood || ad.neighborhood.trim() === '') {
        rejeitadosLocalizacao++;
        detalhesRejeicao.push({ id: ad.listId, title: ad.title, motivo: 'Bairro não identificado no anúncio' });
        continue;
      }

      const adNeighNorm = ad.neighborhood.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const matched = campaign.neighborhoods.some((n) =>
        adNeighNorm.includes(n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase())
      );

      if (!matched) {
        rejeitadosLocalizacao++;
        detalhesRejeicao.push({ id: ad.listId, title: ad.title, motivo: `Bairro '${ad.neighborhood}' fora dos configurados` });
        continue;
      }
    }

    // 3. DEDUPLICAÇÃO EM MÚLTIPLAS CAMADAS
    const normalizedUrl = canonicalizeAdUrl(ad.url);
    const fingerprint = generatePropertyFingerprint({
      neighborhood: ad.neighborhood,
      bedrooms: ad.bedrooms,
      areaM2: ad.areaM2,
      price: ad.price,
      title: ad.title,
      campaignType: campaign.type,
    });

    const candidate = {
      externalId: ad.listId,
      url: ad.url,
      normalizedUrl,
      fingerprint,
      title: ad.title,
      price: ad.price,
      neighborhood: ad.neighborhood,
      bedrooms: ad.bedrooms,
      areaM2: ad.areaM2,
      isPrivate: ad.isPrivate,
      campaignType: campaign.type,
      provider: 'olx',
    };

    const evalResult = evaluateAdEligibility(candidate, campaign, existingList, tombstoneSet);

    if (!evalResult.isEligible) {
      if (evalResult.isPossibleDuplicate) {
        possiveisDuplicados++;
      } else {
        duplicados++;
      }
      continue;
    }

    // Se é elegível e já estava em QUEUED no banco anteriormente, conta como já existente na fila
    if (existingMap.has(ad.listId)) {
      const existing = existingMap.get(ad.listId);
      if (existing.status === 'QUEUED') {
        novosEmQueued.push({
          id: existing.id,
          listId: ad.listId,
          title: ad.title,
          neighborhood: ad.neighborhood,
          price: ad.price,
          status: 'QUEUED (já presente)',
        });
        efetivamenteElegiveis++;
      } else {
        duplicados++;
      }
      continue;
    }

    // Novo elegível
    efetivamenteElegiveis++;

    // Insere no banco
    const { data: inserted, error: insErr } = await supabase
      .from('bot_captures')
      .insert({
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
      })
      .select('id')
      .single();

    if (!insErr && inserted) {
      novosEmQueued.push({
        id: inserted.id,
        listId: ad.listId,
        title: ad.title,
        neighborhood: ad.neighborhood,
        price: ad.price,
        status: 'QUEUED (inserido agora)',
      });
    } else {
      duplicados++;
    }
  }

  // Busca lista atualizada de todos os itens com status QUEUED válidos
  const { data: finalQueued } = await supabase
    .from('bot_captures')
    .select('id, external_id, title, neighborhood, price, status')
    .eq('account_id', accountId)
    .eq('status', 'QUEUED')
    .order('created_at', { ascending: true });

  console.log('\n================================================================');
  console.log('📊 RELATÓRIO OFICIAL DE AUDITORIA E VARREDURA REAL (SEM ENVIO)');
  console.log('================================================================');
  console.log(`• Quantos foram encontrados na OLX:         ${totalEncontrados}`);
  console.log(`• Quantos rejeitados por localização:        ${rejeitadosLocalizacao}`);
  console.log(`• Quantos rejeitados por não particulares:   ${rejeitadosNaoParticulares}`);
  console.log(`• Quantos duplicados (Tombstone/URL/ID/FP):   ${duplicados}`);
  console.log(`• Quantos possíveis duplicados:              ${possiveisDuplicados}`);
  console.log(`• Quantos efetivamente elegíveis:            ${efetivamenteElegiveis}`);
  console.log(`• Total atualmente na fila QUEUED:           ${finalQueued?.length || 0}`);
  console.log('================================================================\n');

  console.log('📋 ANÚNCIOS ATUALMENTE EM "QUEUED" (PRONTOS PARA REVISÃO):');
  finalQueued?.forEach((q, idx) => {
    console.log(`  ${idx + 1}. [ID: ${q.id}]`);
    console.log(`     Título: "${q.title}"`);
    console.log(`     Bairro: ${q.neighborhood} | Valor: R$ ${q.price?.toLocaleString('pt-BR')} | ID OLX: ${q.external_id}\n`);
  });

  console.log('🔒 TRAVA DE SEGURANÇA: ZERO MENSAGENS ENVIADAS.');
}

main().catch((err) => {
  console.error('❌ Erro no processamento:', err);
  process.exit(1);
});
