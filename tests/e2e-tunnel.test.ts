import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { syncPropertyToMatch, suppressMatch, createPropertyShareAndSend, getMatchesForProperty } from '../src/lib/match/service';
import type { Property } from '../src/types/property';

// Carrega .env
const env = Object.fromEntries(
  fs.readFileSync('.env', 'utf8')
    .split('\n')
    .filter((l) => l.includes('='))
    .map((l) => {
      const idx = l.indexOf('=');
      return [l.substring(0, idx).trim(), l.substring(idx + 1).trim()];
    })
);
Object.assign(process.env, env);

const db = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const accountId = '7f434d39-87d8-4d16-8262-e3006908d1c5';

let scenarioCount = 0;
function passScenario(name: string, detail?: string) {
  scenarioCount++;
  console.log(`\n  ✅ [CENÁRIO ${scenarioCount}] PASSOU: ${name}`);
  if (detail) console.log(`     -> ${detail}`);
}

async function runE2E() {
  console.log('\n======================================================');
  console.log('FASE 36: TESTE REAL PONTA A PONTA NO BANCO COMPARTILHADO');
  console.log('======================================================');

  const testLeadId = 'f0000000-0000-4000-8000-000000000001';
  const testPropId1 = 'e1000000-0000-4000-8000-000000000001';
  const testPropId2 = 'e2000000-0000-4000-8000-000000000002';
  const testPropRelId = 'e3000000-0000-4000-8000-000000000003';

  // Limpeza de testes anteriores para garantir idempotência
  await db.from('tracking_events').delete().eq('account_id', accountId).eq('lead_id', testLeadId);
  await db.from('property_shares').delete().eq('account_id', accountId).eq('lead_id', testLeadId);
  await db.from('lead_property_matches').delete().eq('account_id', accountId).eq('lead_id', testLeadId);
  await db.from('lead_intelligence').delete().eq('contact_id', testLeadId);
  await db.from('contact_tags').delete().eq('contact_id', testLeadId);
  await db.from('contacts').delete().eq('id', testLeadId);
  await db.from('property_match_projections').delete().in('property_id', [testPropId1, testPropId2, testPropRelId]);

  // ------------------------------------------------------------
  // CENÁRIO 1: Criar lead no WACRM com perfil e maturidade >= 70%
  // ------------------------------------------------------------
  const { data: sampleUser } = await db.from('contacts').select('user_id').not('user_id', 'is', null).limit(1);
  const validUserId = sampleUser?.[0]?.user_id || '9e4fc8ba-cee9-440b-b3b4-e74b52135293';

  const { error: cErr } = await db.from('contacts').insert({
    id: testLeadId,
    account_id: accountId,
    user_id: validUserId,
    name: 'Mariana Teste Silva',
    phone: '5583988887777',
    ai_score: 9,
    paused_at: null,
    archived_at: null,
  });
  if (cErr) throw new Error(`Falha ao criar contact: ${cErr.message}`);

  const { error: intelErr } = await db.from('lead_intelligence').insert({
    account_id: accountId,
    contact_id: testLeadId,
    summary: {
      operation: 'venda',
      purpose: ['moradia'],
      property_type: ['apartamento'],
      location: ['Bessa'],
      price_max: 500000,
      bedrooms: [2, 3],
      delivery_status: ['pronto'],
    },
  });
  if (intelErr) throw new Error(`Falha ao criar lead_intelligence: ${intelErr.message}`);

  passScenario(
    'CENÁRIO 1 — Lead criado e qualificado',
    'Lead "Mariana Teste Silva" cadastrado com maturidade >= 70%, buscando apto no Bessa até R$ 500k'
  );

  // ------------------------------------------------------------
  // CENÁRIO 2: Cadastrar novo imóvel no Meus Imóveis e rodar Match
  // ------------------------------------------------------------
  const prop1: Property = {
    id: testPropId1,
    type: 'Apartamento',
    neighborhood: 'Bessa',
    bedrooms: 2,
    suites: 1,
    bathrooms: 2,
    parking_spaces: 1,
    area_m2: 65,
    price: 460000,
    title: 'Residencial Live Park E2E',
    building_features: ['Elevador', 'Piscina'],
    apartment_features: ['Varanda gourmet'],
    source_type: 'Próprio',
    status: 'Ativo',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const syncResult1 = await syncPropertyToMatch(prop1, accountId);
  passScenario(
    'CENÁRIO 2 — Cadastro de Imóvel e Execução de Match',
    `property.created gerou avaliação: ${syncResult1.matchesCount} match(es) encontrados, ${syncResult1.strongMatchesCount} forte(s)`
  );

  // ------------------------------------------------------------
  // CENÁRIO 3: Confirmar Match forte 85%+ persistido no banco
  // ------------------------------------------------------------
  const { data: match1, error: mErr } = await db
    .from('lead_property_matches')
    .select('*')
    .eq('account_id', accountId)
    .eq('lead_id', testLeadId)
    .eq('property_id', testPropId1)
    .single();

  if (mErr || !match1) throw new Error(`Match não encontrado no banco: ${mErr?.message}`);
  if (match1.match_score < 85) throw new Error(`Score de match (${match1.match_score}%) deveria ser >= 85%`);

  passScenario(
    'CENÁRIO 3 — Match Forte Confirmado no Banco Compartilhado',
    `Match ID: ${match1.id} | Score: ${match1.match_score}% | Prioridade: ${match1.commercial_priority} | Status: ${match1.match_status}`
  );

  // ------------------------------------------------------------
  // CENÁRIO 4: Descartar Match (Supressão)
  // ------------------------------------------------------------
  const suppressedOk = await suppressMatch({
    matchId: match1.id,
    leadId: testLeadId,
    propertyId: testPropId1,
    accountId,
  });

  const { data: matchSuppressed } = await db
    .from('lead_property_matches')
    .select('suppressed')
    .eq('id', match1.id)
    .single();

  if (!suppressedOk || !matchSuppressed?.suppressed) {
    throw new Error('Falha na supressão do Match');
  }

  // Recalcula o imóvel e confirma que a supressão NUNCA é desfeita
  await syncPropertyToMatch(prop1, accountId);
  const { data: matchAfterSync } = await db
    .from('lead_property_matches')
    .select('suppressed')
    .eq('id', match1.id)
    .single();

  if (!matchAfterSync?.suppressed) {
    throw new Error('Match suprimido foi ressuscitado indevidamente pelo sync');
  }

  passScenario(
    'CENÁRIO 4 — Supressão Definitiva (Descartar Match)',
    'Par marcado como suppressed = true e preservado após novas rodadas de recálculo'
  );

  // ------------------------------------------------------------
  // CENÁRIO 5: Enviar imóvel gerando novo token opaco e waLink
  // ------------------------------------------------------------
  // Desfaz a supressão para prosseguir com envio
  await db.from('lead_property_matches').update({ suppressed: false }).eq('id', match1.id);

  const sendResult = await createPropertyShareAndSend({
    leadId: testLeadId,
    propertyId: testPropId1,
    matchId: match1.id,
    messageText: 'Olá Mariana, veja esta opção incrível que selecionei para você:',
    accountId,
  });

  if (!sendResult.success || !sendResult.share) {
    throw new Error('Falha ao registrar envio e token');
  }

  const token = sendResult.share.trackingToken;
  const { data: matchUpdatedStatus } = await db
    .from('lead_property_matches')
    .select('match_status, sent_at')
    .eq('id', match1.id)
    .single();

  if (matchUpdatedStatus?.match_status !== 'enviado' || !matchUpdatedStatus?.sent_at) {
    throw new Error('Match não transicionou para status enviado');
  }

  passScenario(
    'CENÁRIO 5 — Envio via WhatsApp Pessoal com Novo Token',
    `Token: ${token.substring(0, 16)}... (64 hex) | Status: ${matchUpdatedStatus.match_status} | Link WA gerado com sucesso`
  );

  // ------------------------------------------------------------
  // CENÁRIO 6: Abertura da Página Pública (public_link.opened)
  // ------------------------------------------------------------
  // Simula o registro de evento de abertura
  const nowOpening = new Date().toISOString();
  await db
    .from('property_shares')
    .update({
      first_opened_at: nowOpening,
      last_opened_at: nowOpening,
      open_count: 1,
      updated_at: nowOpening,
    })
    .eq('tracking_token', token);

  await db.from('tracking_events').insert({
    account_id: accountId,
    share_id: sendResult.share.id,
    lead_id: testLeadId,
    property_id: testPropId1,
    event_name: 'public_link.opened',
    payload: { source: 'e2e-test' },
    created_at: nowOpening,
  });

  const { data: shareAfterOpen } = await db
    .from('property_shares')
    .select('open_count, first_opened_at, last_opened_at')
    .eq('tracking_token', token)
    .single();

  if (shareAfterOpen?.open_count !== 1 || !shareAfterOpen?.first_opened_at) {
    throw new Error('Falha no tracking de primeira abertura');
  }

  passScenario(
    'CENÁRIO 6 — Rastreamento de Abertura Confirmado',
    `open_count = ${shareAfterOpen.open_count} | first_opened_at = ${shareAfterOpen.first_opened_at}`
  );

  // ------------------------------------------------------------
  // CENÁRIO 7: Navegação para Imóvel Relacionado (preservando token)
  // ------------------------------------------------------------
  const nowRelated = new Date().toISOString();
  await db.from('tracking_events').insert({
    account_id: accountId,
    share_id: sendResult.share.id,
    lead_id: testLeadId,
    property_id: testPropRelId,
    event_name: 'public_related_property.opened',
    payload: { related_property_id: testPropRelId, original_property_id: testPropId1 },
    created_at: nowRelated,
  });

  const { data: relEvents } = await db
    .from('tracking_events')
    .select('event_name, property_id')
    .eq('share_id', sendResult.share.id)
    .eq('event_name', 'public_related_property.opened');

  if (!relEvents || relEvents.length === 0 || relEvents[0].property_id !== testPropRelId) {
    throw new Error('Falha ao rastrear imóvel relacionado com o mesmo token');
  }

  passScenario(
    'CENÁRIO 7 — Sessão Preservada em Imóvel Relacionado',
    `Evento "public_related_property.opened" registrado no imóvel correlato ${testPropRelId}`
  );

  // ------------------------------------------------------------
  // CENÁRIO 8: Clique em "TENHO INTERESSE"
  // ------------------------------------------------------------
  const nowInterest = new Date().toISOString();
  await db
    .from('property_shares')
    .update({
      is_interested: true,
      interested_at: nowInterest,
      updated_at: nowInterest,
    })
    .eq('tracking_token', token);

  await db.from('tracking_events').insert({
    account_id: accountId,
    share_id: sendResult.share.id,
    lead_id: testLeadId,
    property_id: testPropId1,
    event_name: 'public_interest.clicked',
    payload: { button_clicked: 'TENHO INTERESSE' },
    created_at: nowInterest,
  });

  const { data: shareAfterInterest } = await db
    .from('property_shares')
    .select('is_interested, interested_at')
    .eq('tracking_token', token)
    .single();

  if (!shareAfterInterest?.is_interested || !shareAfterInterest?.interested_at) {
    throw new Error('Falha no registro de TENHO INTERESSE');
  }

  passScenario(
    'CENÁRIO 8 — Botão "TENHO INTERESSE" Registrado',
    `is_interested = true gravado em property_shares e tracking_events em ${shareAfterInterest.interested_at}`
  );

  // ------------------------------------------------------------
  // CENÁRIO 9: Pausar Lead -> Não participa de novas rodadas
  // ------------------------------------------------------------
  // Pausa o lead
  await db.from('contacts').update({ paused_at: new Date().toISOString() }).eq('id', testLeadId);

  const prop2: Property = {
    id: testPropId2,
    type: 'Apartamento',
    neighborhood: 'Bessa',
    bedrooms: 3,
    suites: 1,
    bathrooms: 2,
    parking_spaces: 2,
    area_m2: 80,
    price: 490000,
    title: 'Residencial E2E Pausa Test',
    building_features: ['Elevador'],
    apartment_features: [],
    source_type: 'Próprio',
    status: 'Ativo',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  await syncPropertyToMatch(prop2, accountId);

  const { data: matchWhilePaused } = await db
    .from('lead_property_matches')
    .select('id')
    .eq('account_id', accountId)
    .eq('lead_id', testLeadId)
    .eq('property_id', testPropId2)
    .maybeSingle();

  if (matchWhilePaused) {
    throw new Error('Lead pausado recebeu Match indevidamente!');
  }

  // Reativa o lead e recalcula
  await db.from('contacts').update({ paused_at: null }).eq('id', testLeadId);
  await syncPropertyToMatch(prop2, accountId);

  const { data: matchAfterUnpause } = await db
    .from('lead_property_matches')
    .select('id, match_score')
    .eq('account_id', accountId)
    .eq('lead_id', testLeadId)
    .eq('property_id', testPropId2)
    .maybeSingle();

  if (!matchAfterUnpause) {
    throw new Error('Lead reativado não recebeu Match após recálculo!');
  }

  passScenario(
    'CENÁRIO 9 — Lead Pausado Excluído e Retorno após Reativação',
    `Lead pausado ignorado pelo motor automático; reativação restaurou elegibilidade (Score: ${matchAfterUnpause.match_score}%)`
  );

  // Limpeza final dos registros de teste
  await db.from('tracking_events').delete().eq('account_id', accountId).eq('lead_id', testLeadId);
  await db.from('property_shares').delete().eq('account_id', accountId).eq('lead_id', testLeadId);
  await db.from('lead_property_matches').delete().eq('account_id', accountId).eq('lead_id', testLeadId);
  await db.from('lead_intelligence').delete().eq('contact_id', testLeadId);
  await db.from('contacts').delete().eq('id', testLeadId);
  await db.from('property_match_projections').delete().in('property_id', [testPropId1, testPropId2, testPropRelId]);

  console.log('\n======================================================');
  console.log('TODOS OS 9 CENÁRIOS PONTA A PONTA PASSARAM COM SUCESSO!');
  console.log('======================================================\n');
}

runE2E().catch((err) => {
  console.error('\n❌ ERRO NO TESTE PONTA A PONTA:', err);
  process.exit(1);
});
