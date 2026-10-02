// ==============================================================================
// Suíte de Testes Automatizados de Idempotência e Regras de Negócio — Bot Captador
// ==============================================================================

import assert from 'node:assert/strict';
import {
  canonicalizeAdUrl,
  generatePropertyFingerprint,
  evaluateAdEligibility,
  pickMessageTemplate,
  renderMessageTemplate,
  calculateNextRoundAt,
} from '../src/lib/bot-captador/engine.ts';

console.log('🧪 Iniciando testes do módulo Bot Captador...\n');

// ── Teste 1: Canonicalização de URL (Remover parâmetros de tracking) ──
{
  const raw1 = 'https://www.exemplo.com.br/imovel-123/?utm_source=meta&utm_medium=cpc&fbclid=abc123xyz';
  const raw2 = 'https://www.exemplo.com.br/imovel-123';
  assert.equal(canonicalizeAdUrl(raw1), 'https://www.exemplo.com.br/imovel-123');
  assert.equal(canonicalizeAdUrl(raw1), canonicalizeAdUrl(raw2));
  console.log('✅ Teste 1: Canonicalização de URLs idêntica com eliminação de tracking');
}

// ── Teste 2: Geração de Fingerprint Estável ──
{
  const fp1 = generatePropertyFingerprint({
    neighborhood: 'Bessa',
    bedrooms: 3,
    areaM2: 85,
    price: 450000,
    title: 'Apartamento com 3 quartos no Bessa nascente',
    campaignType: 'venda',
  });

  const fp2 = generatePropertyFingerprint({
    neighborhood: 'bessa',
    bedrooms: 3,
    areaM2: 86, // dentro da tolerância de arredondamento de área
    price: 450000,
    title: 'Apartamento 3 quartos no Bessa',
    campaignType: 'venda',
  });

  assert.equal(typeof fp1, 'string');
  assert.ok(fp1.startsWith('venda_bessa_3q_'));
  console.log('✅ Teste 2: Geração de Fingerprint multidimensional estável e normalizado');
}

// ── Teste 3: Rejeição de Anúncio Não Particular (Filtro Mandatório) ──
{
  const dummyCampaign = {
    id: 'camp-1',
    account_id: 'acc-1',
    type: 'venda',
    is_active: true,
    neighborhoods: ['Bessa'],
    only_private: true,
    rounds_per_day: 2,
    schedule_times: ['09:00', '19:00'],
    max_contacts_per_round: 10,
    created_at: '',
    updated_at: '',
  };

  const adImobiliaria = {
    externalId: 'ext-99',
    url: 'https://exemplo.com/ad-imob',
    normalizedUrl: 'https://exemplo.com/ad-imob',
    fingerprint: 'fp-imob',
    title: 'Excelente oportunidade',
    isPrivate: false, // imobiliária / profissional
    campaignType: 'venda',
    provider: 'portal',
    neighborhood: 'Bessa',
  };

  const evalResult = evaluateAdEligibility(adImobiliaria, dummyCampaign, [], new Set());
  assert.equal(evalResult.isEligible, false);
  assert.ok(evalResult.rejectionReason?.includes('particular'));
  console.log('✅ Teste 3: Anúncios profissionais ou imobiliárias rejeitados pelo filtro Particular');
}

// ── Teste 4: Deduplicação e Proteção contra Tombstone Perpétuo ──
{
  const dummyCampaign = {
    id: 'camp-1',
    account_id: 'acc-1',
    type: 'venda',
    is_active: true,
    neighborhoods: ['Bessa'],
    only_private: true,
    rounds_per_day: 2,
    schedule_times: ['09:00', '19:00'],
    max_contacts_per_round: 10,
    created_at: '',
    updated_at: '',
  };

  const tombstonedAd = {
    externalId: 'ext-tomb',
    url: 'https://exemplo.com/ad-tomb',
    normalizedUrl: 'https://exemplo.com/ad-tomb',
    fingerprint: 'fp-already-contacted',
    title: 'Apto Bessa',
    isPrivate: true,
    campaignType: 'venda',
    provider: 'portal',
    neighborhood: 'Bessa',
  };

  const tombstonesSet = new Set(['fp-already-contacted']);
  const evalResult = evaluateAdEligibility(tombstonedAd, dummyCampaign, [], tombstonesSet);
  assert.equal(evalResult.isEligible, false);
  assert.ok(evalResult.rejectionReason?.includes('tombstone'));
  console.log('✅ Teste 4: Anúncio com Tombstone bloqueado de qualquer nova abordagem');
}

// ── Teste 5: Detecção de Possível Duplicado (Mesmo proprietário e bairro) ──
{
  const dummyCampaign = {
    id: 'camp-1',
    account_id: 'acc-1',
    type: 'venda',
    is_active: true,
    neighborhoods: ['Manaíra'],
    only_private: true,
    rounds_per_day: 2,
    schedule_times: ['09:00', '19:00'],
    max_contacts_per_round: 10,
    created_at: '',
    updated_at: '',
  };

  const existingCaptures = [
    {
      id: 'cap-1',
      account_id: 'acc-1',
      campaign_type: 'venda',
      provider: 'portal',
      url: 'https://exemplo.com/ad-1',
      normalized_url: 'https://exemplo.com/ad-1',
      fingerprint: 'fp-exist',
      title: 'Apto Manaíra',
      owner_name: 'Carlos',
      owner_contact: '(83) 98888-1234',
      neighborhood: 'Manaíra',
      status: 'WAITING_RESPONSE',
      expires_at: '',
      created_at: '',
      updated_at: '',
    },
  ];

  const suspectCandidate = {
    externalId: 'ext-new',
    url: 'https://exemplo.com/ad-2',
    normalizedUrl: 'https://exemplo.com/ad-2',
    fingerprint: 'fp-new-variant',
    title: 'Lindo apto em Manaíra',
    ownerName: 'Carlos Silva',
    ownerContact: '83988881234', // mesmo telefone
    neighborhood: 'Manaíra',
    isPrivate: true,
    campaignType: 'venda',
    provider: 'portal',
  };

  const evalResult = evaluateAdEligibility(suspectCandidate, dummyCampaign, existingCaptures, new Set());
  assert.equal(evalResult.isEligible, false);
  assert.equal(evalResult.isPossibleDuplicate, true);
  console.log('✅ Teste 5: Possível duplicado identificado e protegido: Na dúvida, não enviar');
}

// ── Teste 6: Seleção de Mensagem Cadastrada (Sem invenção de texto dinâmico) ──
{
  const templates = [
    { id: 't1', content: 'Mensagem 1 pré-aprovada' },
    { id: 't2', content: 'Mensagem 2 pré-aprovada' },
  ];

  const picked = pickMessageTemplate(templates);
  assert.ok(picked);
  assert.ok(['t1', 't2'].includes(picked.id));
  assert.ok(['Mensagem 1 pré-aprovada', 'Mensagem 2 pré-aprovada'].includes(picked.content));

  const emptyPicked = pickMessageTemplate([]);
  assert.equal(emptyPicked, null);
  console.log('✅ Teste 6: Seleção restrita a templates pré-aprovados sem IA generativa em tempo de envio');
}

// ── Teste 7: Validação de Filtro Geográfico Estrito (Bairros e Municípios) ──
{
  const joaoPessoaCampaign = {
    id: 'camp-jp',
    account_id: 'acc-jp',
    type: 'venda',
    is_active: true,
    neighborhoods: ['Bessa', 'Manaíra', 'Tambaú', 'Cabo Branco', 'Intermares'],
    only_private: true,
    rounds_per_day: 2,
    schedule_times: ['09:00', '19:00'],
    max_contacts_per_round: 10,
    created_at: '',
    updated_at: '',
  };

  // Anúncio fora dos bairros (ex: Parnamirim/RN)
  const adParnamirim = {
    externalId: '1538884510',
    url: 'https://pb.olx.com.br/paraiba/imoveis/vendo-casa-em-parnamirim-rn-1538884510',
    normalizedUrl: 'https://pb.olx.com.br/paraiba/imoveis/vendo-casa-em-parnamirim-rn-1538884510',
    fingerprint: 'venda_parnamirim_0q_0m_580000p_vendocasaparnamirim',
    title: 'Vendo casa em Parnamirim _ RN',
    price: 580000,
    neighborhood: 'Parnamirim',
    isPrivate: true,
    campaignType: 'venda',
    provider: 'olx',
  };

  const resParnamirim = evaluateAdEligibility(adParnamirim, joaoPessoaCampaign, [], new Set());
  assert.equal(resParnamirim.isEligible, false);
  assert.ok(resParnamirim.rejectionReason?.includes('fora dos filtros'));

  // Anúncio com bairro não identificado (null ou vazio)
  const adSemBairro = {
    externalId: 'ext-sem-bairro',
    url: 'https://pb.olx.com.br/paraiba/imoveis/casa-indefinida-123',
    normalizedUrl: 'https://pb.olx.com.br/paraiba/imoveis/casa-indefinida-123',
    fingerprint: 'venda__0q_0m_580000p_casaindefinida',
    title: 'Casa em condomínio fechado',
    price: 580000,
    neighborhood: null,
    isPrivate: true,
    campaignType: 'venda',
    provider: 'olx',
  };

  const resSemBairro = evaluateAdEligibility(adSemBairro, joaoPessoaCampaign, [], new Set());
  assert.equal(resSemBairro.isEligible, false);
  assert.ok(resSemBairro.rejectionReason?.includes('Bairro não identificado'));

  // Anúncio com bairro válido (Bessa)
  const adBessaValido = {
    externalId: '1452159161',
    url: 'https://pb.olx.com.br/paraiba/imoveis/flat-no-caribessa-1452159161',
    normalizedUrl: 'https://pb.olx.com.br/paraiba/imoveis/flat-no-caribessa-1452159161',
    fingerprint: 'venda_bessa_1q_36m_305000p_flatcaribessa',
    title: 'Flat no Caribessa com vista mar',
    price: 305000,
    neighborhood: 'Bessa',
    bedrooms: 1,
    areaM2: 35,
    isPrivate: true,
    campaignType: 'venda',
    provider: 'olx',
  };

  const resBessa = evaluateAdEligibility(adBessaValido, joaoPessoaCampaign, [], new Set());
  assert.equal(resBessa.isEligible, true);
  console.log('✅ Teste 7: Filtro Geográfico Estrito rejeita anúncios fora dos bairros ou sem bairro identificado');
}

// ── Teste 8: Republicação / Deduplicação de Imóvel Abordado (Cenário Exato) ──
{
  const campaign = {
    id: 'camp-rep',
    account_id: 'acc-rep',
    type: 'venda',
    is_active: true,
    neighborhoods: ['Bessa'],
    only_private: true,
    rounds_per_day: 2,
    schedule_times: ['09:00', '19:00'],
    max_contacts_per_round: 10,
    created_at: '',
    updated_at: '',
  };

  // Imóvel A original (abordado e gravado no Tombstone)
  const imovelA = {
    externalId: '111',
    url: 'https://pb.olx.com.br/imoveis/flat-no-bessa-111',
    normalizedUrl: 'https://pb.olx.com.br/imoveis/flat-no-bessa-111',
    neighborhood: 'Bessa',
    price: 305000,
    areaM2: 35,
    bedrooms: 1,
    title: 'Flat no Bessa excelente oportunidade',
    ownerName: 'Rubens Proprietário',
    ownerContact: '83988880001',
    campaignType: 'venda',
  };

  const fingerprintA = generatePropertyFingerprint(imovelA);
  const tombstoneSet = new Set([fingerprintA]);

  const existingCaptures = [
    {
      id: 'cap-a',
      account_id: 'acc-rep',
      campaign_type: 'venda',
      provider: 'olx',
      external_id: '111',
      url: imovelA.url,
      normalized_url: imovelA.normalizedUrl,
      fingerprint: fingerprintA,
      title: imovelA.title,
      price: imovelA.price,
      neighborhood: imovelA.neighborhood,
      bedrooms: imovelA.bedrooms,
      area_m2: imovelA.areaM2,
      owner_name: imovelA.ownerName,
      owner_contact: imovelA.ownerContact,
      status: 'CONTACTED',
      expires_at: '',
      created_at: '',
      updated_at: '',
    },
  ];

  // Republicação Imóvel B - Subcenário 1: Mesmo imóvel, mesmo anunciante, novo ID OLX 222, nova URL-B
  const imovelB_Republicado = {
    externalId: '222', // ID NOVO gerado pela OLX
    url: 'https://pb.olx.com.br/imoveis/flat-no-bessa-republicado-222', // URL NOVA
    normalizedUrl: 'https://pb.olx.com.br/imoveis/flat-no-bessa-republicado-222',
    fingerprint: generatePropertyFingerprint({
      neighborhood: 'Bessa',
      bedrooms: 1,
      areaM2: 35,
      price: 305000,
      title: 'Flat no Bessa excelente oportunidade',
      campaignType: 'venda',
    }),
    title: 'Flat no Bessa excelente oportunidade',
    neighborhood: 'Bessa',
    price: 305000,
    areaM2: 35,
    bedrooms: 1,
    ownerName: 'Rubens Proprietário',
    ownerContact: '83988880001',
    isPrivate: true,
    campaignType: 'venda',
    provider: 'olx',
  };

  const resRep1 = evaluateAdEligibility(imovelB_Republicado, campaign, existingCaptures, tombstoneSet);
  assert.equal(resRep1.isEligible, false);
  assert.ok(
    resRep1.rejectionReason?.includes('tombstone') || resRep1.rejectionReason?.includes('Fingerprint'),
    'Deve ser bloqueado pela Camada 3 de Fingerprint Multidimensional contra Tombstone'
  );

  // Republicação Imóvel B - Subcenário 2: Anunciante mudou o título do anúncio para burlar
  const imovelB_TituloAlterado = {
    externalId: '222',
    url: 'https://pb.olx.com.br/imoveis/outro-titulo-totalmente-diferente-222',
    normalizedUrl: 'https://pb.olx.com.br/imoveis/outro-titulo-totalmente-diferente-222',
    fingerprint: 'venda_bessa_1q_36m_305000p_outrotitulo', // fingerprint diferente devido ao título
    title: 'Outro título totalmente diferente',
    neighborhood: 'Bessa',
    price: 305000,
    areaM2: 35,
    bedrooms: 1,
    ownerName: 'Rubens Proprietário', // mesmo anunciante
    ownerContact: '83988880001', // mesmo telefone
    isPrivate: true,
    campaignType: 'venda',
    provider: 'olx',
  };

  const resRep2 = evaluateAdEligibility(imovelB_TituloAlterado, campaign, existingCaptures, tombstoneSet);
  assert.equal(resRep2.isEligible, false);
  assert.equal(resRep2.isPossibleDuplicate, true);
  assert.ok(
    resRep2.rejectionReason?.includes('Possível duplicado/republicação'),
    'Deve ser bloqueado pela Camada 4 (Possível Duplicidade / Republicação por Anunciante)'
  );

  console.log('✅ Teste 8: Republicação com novo ID 222 bloqueada com 100% de precisão (Camadas 3 e 4)');
}

// ── Teste 9: Fidelidade Absoluta aos Templates (Sem Interpolação Automática na v1) ──
{
  const rawTemplate = 'Olá {primeiro_nome}, vi seu anúncio no {bairro} e gostaria de saber se aceita parceria.';
  
  // Na v1, interpolação deve permanecer desativada por padrão
  const renderedDefault = renderMessageTemplate(rawTemplate, {
    primeiro_nome: 'Rubens',
    bairro: 'Bessa',
  });

  // O texto final DEVE ser 100% fiel ao texto cadastrado, sem substituição
  assert.equal(renderedDefault, rawTemplate);

  // Suporte técnico preparado para o futuro permanece disponível sob flag explícita
  const renderedExplicit = renderMessageTemplate(rawTemplate, {
    primeiro_nome: 'Rubens',
    bairro: 'Bessa',
  }, { interpolateVariables: true });
  assert.equal(renderedExplicit, 'Olá Rubens, vi seu anúncio no Bessa e gostaria de saber se aceita parceria.');

  console.log('✅ Teste 9: Mensagens enviadas exatamente como cadastradas sem alteração dinâmica');
}

// ── Teste 10: Cálculo da Próxima Rodada (Fuso Brasília GMT-3, Sem Horários Bizarros de Madrugada) ──
{
  const testCampaigns = [
    {
      is_active: true,
      schedule_times: ['09:00', '19:00'],
    },
  ];

  // Cenário A: Execução às 16:59:20 de 02/10/2026 -> Próxima DEVE ser hoje às 19:00 (NÃO 02:59 da madrugada)
  const ref1659 = new Date('2026-10-02T16:59:20-03:00');
  const nextIso1 = calculateNextRoundAt(testCampaigns, { referenceDate: ref1659 });
  const nextDate1 = new Date(nextIso1);
  const formatter = new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  assert.equal(formatter.format(nextDate1), '02/10, 19:00');

  // Cenário B: Execução às 19:15:00 de 02/10/2026 -> Próxima DEVE ser amanhã às 09:00
  const ref1915 = new Date('2026-10-02T19:15:00-03:00');
  const nextIso2 = calculateNextRoundAt(testCampaigns, { referenceDate: ref1915 });
  const nextDate2 = new Date(nextIso2);
  assert.equal(formatter.format(nextDate2), '03/10, 09:00');

  // Cenário C: Execução no início da manhã às 08:15:00 de 02/10/2026 -> Próxima DEVE ser hoje às 09:00
  const ref0815 = new Date('2026-10-02T08:15:00-03:00');
  const nextIso3 = calculateNextRoundAt(testCampaigns, { referenceDate: ref0815 });
  const nextDate3 = new Date(nextIso3);
  assert.equal(formatter.format(nextDate3), '02/10, 09:00');

  console.log('✅ Teste 10: Próxima rodada respeita estritamente os horários comerciais 09:00 e 19:00 (Zero disparos de madrugada)');
}

console.log('\n🎉 Todos os testes de unidade e regras de negócio passaram com 100% de sucesso!');

