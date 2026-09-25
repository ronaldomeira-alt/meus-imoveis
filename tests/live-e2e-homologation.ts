import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Carrega variáveis locais via fs nativo
function loadEnvFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const k = trimmed.slice(0, idx).trim();
        const v = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
}

loadEnvFile('C:/Projetos/WACRM/.env.local');
loadEnvFile('C:/Projetos/meus-imoveis/.env');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://qedptmrcvcbzhucoeznd.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SERVICE_KEY) {
  console.error('[FATAL] SUPABASE_SERVICE_ROLE_KEY ausente.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const WACRM_BASE_URL = 'https://crmronaldomeira.com';
const MEUS_IMOVEIS_BASE_URL = 'https://ronaldomeira.com.br';

interface E2EResult {
  step: string;
  name: string;
  passed: boolean;
  details?: any;
}

const results: E2EResult[] = [];

function recordStep(step: string, name: string, passed: boolean, details?: any) {
  results.push({ step, name, passed, details });
  const icon = passed ? '✓' : '✗';
  console.log(`  ${icon} [${step}] ${name}`);
  if (details) {
    console.log(`      ↳ ${typeof details === 'string' ? details : JSON.stringify(details)}`);
  }
}

async function runLiveE2E() {
  const timestamp = Date.now();
  const testId = `E2E-TUNNEL-${timestamp}`;
  console.log('======================================================');
  console.log(`INICIANDO HOMOLOGAÇÃO E2E FINAL HTTP (ID: ${testId})`);
  console.log(`WACRM: ${WACRM_BASE_URL}`);
  console.log(`Meus Imóveis: ${MEUS_IMOVEIS_BASE_URL}`);
  console.log(`Supabase: ${SUPABASE_URL}`);
  console.log('======================================================\n');

  // IDs para teardown garantido
  let accountId: string | null = null;
  let contactId: string | null = null;
  let propertyId: string | null = null;
  let matchId: string | null = null;
  let shareId: string | null = null;

  try {
    // 0. Resolução da Conta Padrão e User ID
    const { data: account, error: accErr } = await supabase
      .from('accounts')
      .select('id')
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    if (accErr || !account) {
      throw new Error(`Falha ao obter account_id: ${accErr?.message}`);
    }
    accountId = account.id;

    const { data: sampleContact } = await supabase
      .from('contacts')
      .select('user_id')
      .not('user_id', 'is', null)
      .limit(1)
      .single();

    const userId = sampleContact?.user_id;
    if (!userId) {
      throw new Error('Nenhum user_id válido encontrado para associar ao lead de teste.');
    }
    recordStep('INIT', 'Identificação da conta ativa e usuário no CRM', true, { accountId, userId });

    // 1. Criação do Lead Sintético no WACRM
    const phone = `558399999${String(timestamp).slice(-4)}`;
    const { data: contact, error: contactErr } = await supabase
      .from('contacts')
      .insert({
        account_id: accountId,
        user_id: userId,
        name: `${testId} Lead Teste`,
        phone,
        ai_score: 8, // Quente
        paused_at: null,
        archived_at: null,
      })
      .select('id, name, phone, ai_score')
      .single();

    if (contactErr || !contact) {
      throw new Error(`Falha ao criar contato sintético: ${contactErr?.message}`);
    }
    contactId = contact.id;

    // Search Profile completo via lead_intelligence para garantir maturidade >= 70%
    const summaryData = {
      location: ['Altiplano'],
      property_type: ['apartamento'],
      bedrooms: [3],
      price_min: 300000,
      price_max: 600000,
      purpose: ['compra', 'moradia'],
      notes: 'Busca apartamento pronto ou em construção no Altiplano com 3 quartos',
      features: ['piscina', 'varanda gourmet'],
    };

    const { error: intelErr } = await supabase.from('lead_intelligence').insert({
      account_id: accountId,
      contact_id: contactId,
      summary: summaryData,
    });
    if (intelErr) throw new Error(`Falha ao inserir lead_intelligence: ${intelErr.message}`);

    recordStep('STEP 1', 'Lead sintético criado com Search Profile completo e maturidade >= 70%', true, {
      contactId,
      name: contact.name,
      phone: contact.phone,
      score: contact.ai_score,
      summary: summaryData,
    });

    // 2. Definição do Imóvel Sintético
    propertyId = crypto.randomUUID();
    const propertyCode = `E2E-${String(timestamp).slice(-6)}`;
    const propertyTitle = `${testId} Imóvel Teste`;

    recordStep('STEP 2', 'Imóvel sintético estruturado para projeção no túnel', true, {
      propertyId,
      code: propertyCode,
      title: propertyTitle,
      price: 450000,
      neighborhood: 'Altiplano',
      bedrooms: 3,
    });

    // 3. Sincronização via Túnel (Proxy Serverless do Meus Imóveis -> WACRM)
    const syncPayload = {
      property_id: propertyId,
      code: propertyCode,
      title: propertyTitle,
      operation: 'venda',
      property_type: 'apartamento',
      neighborhood: 'Altiplano',
      city: 'João Pessoa',
      price_min: 450000,
      price_max: 450000,
      bedrooms_min: 3,
      bedrooms_max: 3,
      status: 'ativo',
    };

    const syncRes = await fetch(`${MEUS_IMOVEIS_BASE_URL}/api/tunnel/v1/properties/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(syncPayload),
    });

    const syncJson = await syncRes.json();
    if (!syncRes.ok || !syncJson.success) {
      throw new Error(`Falha no sync via túnel (${syncRes.status}): ${JSON.stringify(syncJson)}`);
    }
    recordStep('STEP 3', 'Sincronização via túnel (Meus Imóveis -> WACRM) executada com sucesso', true, {
      status: syncRes.status,
      recalculated: syncJson.recalculated,
      matchesCalculated: syncJson.matches_count,
    });

    // 4. Verificação do Match Determinístico e Prioridade Comercial no Supabase
    const { data: match, error: matchErr } = await supabase
      .from('lead_property_matches')
      .select('*')
      .eq('account_id', accountId)
      .eq('lead_id', contactId)
      .eq('property_id', propertyId)
      .maybeSingle();

    if (matchErr || !match) {
      throw new Error(`Match não encontrado em lead_property_matches: ${matchErr?.message}`);
    }
    matchId = match.id;

    const isMatchForte = match.match_score >= 85;
    const isMaturityHigh = match.profile_maturity >= 70;
    const hasPriority = typeof match.commercial_priority === 'number' && match.commercial_priority > 0;

    recordStep('STEP 4', 'Match determinístico calculado pelo WACRM com fórmula canônica', isMatchForte && isMaturityHigh && hasPriority, {
      matchId: match.id,
      match_score: `${match.match_score}% (Forte: ${isMatchForte})`,
      profile_maturity: `${match.profile_maturity}%`,
      commercial_priority: match.commercial_priority,
      breakdown: match.score_breakdown,
      suppressed: match.suppressed,
    });

    // 5. Criação do Compartilhamento (Share) via Túnel
    const shareRes = await fetch(`${MEUS_IMOVEIS_BASE_URL}/api/tunnel/v1/shares/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lead_id: contactId,
        property_id: propertyId,
        match_id: matchId,
        message_text: 'Olá! Veja esta oportunidade exclusiva.',
      }),
    });

    const shareJson = await shareRes.json();
    if (!shareRes.ok || !shareJson.success) {
      throw new Error(`Falha ao criar share via túnel (${shareRes.status}): ${JSON.stringify(shareJson)}`);
    }
    shareId = shareJson.share?.id || shareJson.shareId;
    const trackingToken = shareJson.share?.trackingToken || shareJson.share?.tracking_token || shareJson.trackingToken;

    const isToken64Hex = typeof trackingToken === 'string' && trackingToken.length === 64 && /^[0-9a-f]{64}$/i.test(trackingToken);
    const isWaLinkValid = typeof shareJson.waLink === 'string' && shareJson.waLink.startsWith('https://wa.me/');

    recordStep('STEP 5', 'Compartilhamento criado com token opaco 64-hex e link wa.me pessoal', isToken64Hex && isWaLinkValid, {
      shareId,
      tokenLength: trackingToken ? trackingToken.length : 0,
      tokenSafe: isToken64Hex,
      publicUrl: shareJson.publicUrl,
      waLink: shareJson.waLink ? shareJson.waLink.slice(0, 45) + '...' : '',
    });

    // 6. Abertura da Página Pública e Deduplicação (< 5 segundos)
    // 6.1 Primeira abertura
    const track1Res = await fetch(`${WACRM_BASE_URL}/api/tunnel/v1/events/tracking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tracking_token: trackingToken,
        event_name: 'public_link.opened',
      }),
    });
    const track1Json = await track1Res.json();
    if (!track1Res.ok || !track1Json.success) {
      throw new Error(`Falha no evento track 1: ${JSON.stringify(track1Json)}`);
    }

    const { data: shareAfter1 } = await supabase
      .from('property_shares')
      .select('open_count, first_opened_at, last_opened_at')
      .eq('id', shareId)
      .single();

    const openCount1 = shareAfter1?.open_count === 1 && shareAfter1?.first_opened_at != null;

    // 6.2 Segunda abertura imediata (dentro da janela de 5s para testar deduplicação)
    const track2Res = await fetch(`${WACRM_BASE_URL}/api/tunnel/v1/events/tracking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tracking_token: trackingToken,
        event_name: 'public_link.opened',
      }),
    });
    const track2Json = await track2Res.json();
    if (!track2Res.ok || !track2Json.success) {
      throw new Error(`Falha no evento track 2: ${JSON.stringify(track2Json)}`);
    }

    const { data: shareAfter2 } = await supabase
      .from('property_shares')
      .select('open_count')
      .eq('id', shareId)
      .single();

    const isDeduped = shareAfter2?.open_count === 1;

    recordStep('STEP 6', 'Telemetria de abertura e guarda anti-reload (<5s) validada', openCount1 && isDeduped, {
      firstOpenedAt: shareAfter1?.first_opened_at,
      openCountAposPrimeira: shareAfter1?.open_count,
      openCountAposRecargaImediata: shareAfter2?.open_count,
      deduplicadoCorretamente: isDeduped,
    });

    // 7. Navegação em Imóvel Relacionado
    const relatedPropertyId = crypto.randomUUID();
    const trackRelRes = await fetch(`${WACRM_BASE_URL}/api/tunnel/v1/events/tracking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tracking_token: trackingToken,
        event_name: 'public_related_property.opened',
        related_property_id: relatedPropertyId,
      }),
    });
    const trackRelJson = await trackRelRes.json();
    const { data: relEvent } = await supabase
      .from('tracking_events')
      .select('*')
      .eq('share_id', shareId)
      .eq('event_name', 'public_related_property.opened')
      .maybeSingle();

    recordStep('STEP 7', 'Navegação em imóvel relacionado registrada com preservação de token', trackRelRes.ok && relEvent != null, {
      relatedPropertyId,
      eventFound: !!relEvent,
      eventName: relEvent?.event_name,
    });

    // 8. Clique em "Tenho Interesse"
    const trackIntRes = await fetch(`${WACRM_BASE_URL}/api/tunnel/v1/events/tracking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tracking_token: trackingToken,
        event_name: 'public_interest.clicked',
      }),
    });
    const trackIntJson = await trackIntRes.json();

    const { data: shareAfterInt } = await supabase
      .from('property_shares')
      .select('is_interested, interested_at')
      .eq('id', shareId)
      .single();

    const isInterestedOk = shareAfterInt?.is_interested === true && shareAfterInt?.interested_at != null;

    recordStep('STEP 8', 'Clique em Tenho Interesse registrado com conversão de estado', isInterestedOk, {
      is_interested: shareAfterInt?.is_interested,
      interested_at: shareAfterInt?.interested_at,
    });

    // 9. Supressão / Descarte do Match
    const { error: suppErr } = await supabase
      .from('lead_property_matches')
      .update({ suppressed: true })
      .eq('id', matchId);

    if (suppErr) throw new Error(`Falha ao suprimir match: ${suppErr.message}`);

    // Consulta de compatíveis via endpoint com token autenticado
    const compRes = await fetch(`${WACRM_BASE_URL}/api/tunnel/v1/leads/compatible?property_id=${propertyId}`, {
      headers: { Authorization: `Bearer ${SERVICE_KEY}` },
    });
    const compJson = await compRes.json();
    const notInCompatible = Array.isArray(compJson.leads) && !compJson.leads.some((l: any) => l.lead_id === contactId);

    recordStep('STEP 9', 'Descarte e supressão excluem lead das rodadas ativas do imóvel', notInCompatible, {
      suppressedInDb: true,
      excludedFromCompatibleEndpoint: notInCompatible,
      remainingCount: compJson.leads?.length ?? 0,
    });

  } finally {
    // 10. LIMPEZA COMPLETA (TEARDOWN EM ORDEM REVERSA)
    console.log('\n--- EXECUTANDO TEARDOWN COMPLETO DOS REGISTROS SINTÉTICOS ---');
    let cleanupReport: Record<string, number> = {};

    if (shareId) {
      const { data: delEvents } = await supabase.from('tracking_events').delete().eq('share_id', shareId).select('id');
      cleanupReport['tracking_events'] = delEvents?.length || 0;

      const { data: delShares } = await supabase.from('property_shares').delete().eq('id', shareId).select('id');
      cleanupReport['property_shares'] = delShares?.length || 0;
    }

    if (matchId) {
      const { data: delMatches } = await supabase.from('lead_property_matches').delete().eq('id', matchId).select('id');
      cleanupReport['lead_property_matches'] = delMatches?.length || 0;
    }

    if (propertyId) {
      const { data: delProjections } = await supabase.from('property_match_projections').delete().eq('property_id', propertyId).select('id');
      cleanupReport['property_match_projections'] = delProjections?.length || 0;
    }

    if (contactId) {
      const { data: delIntel } = await supabase.from('lead_intelligence').delete().eq('contact_id', contactId).select('id');
      cleanupReport['lead_intelligence'] = delIntel?.length || 0;

      const { data: delTags } = await supabase.from('contact_tags').delete().eq('contact_id', contactId).select('id');
      cleanupReport['contact_tags'] = delTags?.length || 0;

      const { data: delContacts } = await supabase.from('contacts').delete().eq('id', contactId).select('id');
      cleanupReport['contacts'] = delContacts?.length || 0;
    }

    // Validação de Resíduos Sintéticos
    const { count: orphanContacts } = await supabase.from('contacts').select('*', { count: 'exact', head: true }).ilike('name', `%${testId}%`);
    const { count: orphanProjections } = await supabase.from('property_match_projections').select('*', { count: 'exact', head: true }).ilike('title', `%${testId}%`);

    const zeroResidue = (orphanContacts || 0) === 0 && (orphanProjections || 0) === 0;
    recordStep('STEP 10', 'Teardown completo e verificação de resíduo zero', zeroResidue, {
      cleanedRecords: cleanupReport,
      orphanContacts: orphanContacts || 0,
      orphanProjections: orphanProjections || 0,
    });
  }

  const allPassed = results.every(r => r.passed);
  console.log('\n======================================================');
  console.log(`RESULTADO FINAL DO E2E: ${allPassed ? '100% APROVADO' : 'FALHOU'}`);
  console.log(`TOTAL DE ETAPAS: ${results.length} | PASSARAM: ${results.filter(r => r.passed).length} | FALHARAM: ${results.filter(r => !r.passed).length}`);
  console.log('======================================================');

  if (!allPassed) {
    process.exit(1);
  }
}

runLiveE2E().catch(err => {
  console.error('[ERRO FATAL NO E2E]:', err);
  process.exit(1);
});
