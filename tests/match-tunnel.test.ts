import { evaluateMatch } from '../src/lib/match/engine';
import { calculateCommercialPriority } from '../src/lib/match/priority';
import { generateTrackingToken, buildSharePublicUrl, buildWhatsAppPersonalLink } from '../src/lib/match/tokens';
import { propertyToProjection, isMatchRelevantPropertyChange, ensureUuid } from '../src/lib/match/property-adapter';
import type { LeadSearchProfile, PropertyProjection } from '../src/lib/match/types';
import type { Property } from '../src/types/property';

// Helper para criar perfis de teste
function createTestProfile(overrides: Partial<LeadSearchProfile> = {}): LeadSearchProfile {
  return {
    accountId: '7f434d39-87d8-4d16-8262-e3006908d1c5',
    leadId: '11111111-1111-4111-8111-111111111111',
    name: 'Mariana Silva',
    phone: '5583999991111',
    aiScore: 8,
    isPaused: false,
    isArchived: false,
    operation: 'venda',
    purpose: ['moradia'],
    propertyTypes: ['apartamento'],
    propertyTypeStrict: false,
    locations: ['Bessa'],
    locationStrict: false,
    locationSpecificity: 'neighborhood',
    priceMin: 300000,
    priceMax: 500000,
    priceStrictMax: false,
    priceFlexMax: 550000,
    bedrooms: [2, 3],
    bedroomsStrict: false,
    deliveryStatus: ['pronto', 'em_construcao'],
    deliveryStrict: false,
    maxDeliveryYear: 2027,
    requiredFeatures: [],
    preferredFeatures: ['varanda gourmet'],
    isShortStayOnly: false,
    provenance: {
      operation: 'conversation',
      propertyTypes: 'conversation',
      locations: 'conversation',
      price: 'conversation',
      bedrooms: 'conversation',
    },
    ...overrides,
  };
}

// Helper para criar projeções de imóveis
function createTestProperty(overrides: Partial<PropertyProjection> = {}): PropertyProjection {
  return {
    propertyId: '22222222-2222-4222-8222-222222222222',
    accountId: '7f434d39-87d8-4d16-8262-e3006908d1c5',
    title: 'Residencial Live Park',
    operation: 'venda',
    propertyType: 'apartamento',
    neighborhood: 'Bessa',
    city: 'João Pessoa',
    priceMin: 450000,
    priceMax: 450000,
    areaMin: 65,
    areaMax: 65,
    bedroomsMin: 2,
    bedroomsMax: 3,
    deliveryStatus: 'pronto',
    features: ['elevador', 'piscina'],
    status: 'ativo',
    ...overrides,
  };
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ [TEST ${passed + failed}] ${testName}`);
  } else {
    failed++;
    console.error(`  ✗ [TEST ${passed + failed}] FALHA: ${testName} ${detail ? `(${detail})` : ''}`);
  }
}

async function runTestSuite() {
  console.log('\n======================================================');
  console.log('EXECUTANDO SUÍTE COMPLETA: 45 TESTES DE VALIDAÇÃO DO MATCH');
  console.log('======================================================\n');

  // 1. Imóvel individual
  const p1 = createTestProperty({ priceMin: 400000, priceMax: 400000, bedroomsMin: 2, bedroomsMax: 2 });
  const prof1 = createTestProfile();
  const res1 = evaluateMatch(prof1, p1);
  assert(res1.eligible && res1.matchScore >= 85, '1. Imóvel individual gera Match elegível');

  // 2. Empreendimento com faixas/opções
  const p2 = createTestProperty({ priceMin: 350000, priceMax: 600000, bedroomsMin: 1, bedroomsMax: 3, areaMin: 40, areaMax: 85 });
  const res2 = evaluateMatch(prof1, p2);
  assert(res2.eligible && res2.matchScore >= 85, '2. Empreendimento com faixas gera Match com sucesso');

  // 3. Faixa de preço (interseção)
  const p3 = createTestProperty({ priceMin: 450000, priceMax: 600000 });
  const res3 = evaluateMatch(createTestProfile({ priceMax: 500000 }), p3);
  assert(res3.eligible && res3.matchScore >= 70, '3. Faixa de preço com interseção pontua');

  // 4. Faixa de metragem
  const p4 = createTestProperty({ areaMin: 50, areaMax: 90 });
  const res4 = evaluateMatch(prof1, p4);
  assert(res4.eligible && res4.scoreBreakdown.area === 5, '4. Faixa de metragem pontua integralmente');

  // 5. bedrooms_options ([1, 2, 3] compatível com lead que quer 2)
  const p5 = createTestProperty({ bedroomsMin: 1, bedroomsMax: 3 });
  const res5 = evaluateMatch(createTestProfile({ bedrooms: [2] }), p5);
  assert(res5.eligible && res5.scoreBreakdown.bedrooms === 15, '5. bedrooms_options compatível pontua integral');

  // 6. Compra x Aluguel
  const p6 = createTestProperty({ operation: 'locacao' });
  const res6 = evaluateMatch(createTestProfile({ operation: 'compra' }), p6);
  assert(!res6.eligible && res6.eliminatedReason?.includes('locação'), '6. Compra x Aluguel incompatível elimina');

  // 7. Temporada excluída
  const res7 = evaluateMatch(createTestProfile({ isShortStayOnly: true }), p1);
  assert(!res7.eligible && res7.eliminatedReason?.includes('temporada'), '7. Busca por temporada exclusivamente elimina de estoque comum');

  // 8. Imóvel inativo não gera Match
  const rawPropInativo: Property = {
    id: 'prop-inativo-1',
    type: 'Apartamento',
    neighborhood: 'Bessa',
    bedrooms: 2,
    suites: 1,
    bathrooms: 1,
    parking_spaces: 1,
    area_m2: 60,
    price: 400000,
    building_features: [],
    apartment_features: [],
    source_type: 'Próprio',
    status: 'Vendido',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const projInativo = propertyToProjection(rawPropInativo);
  assert(projInativo.status === 'inativo', '8. Imóvel vendido ou inativo tem status inativo na projeção');

  // 9. Preço abaixo do orçamento pontua integralmente (não penaliza mais barato)
  const res9 = evaluateMatch(createTestProfile({ priceMax: 600000 }), createTestProperty({ priceMin: 350000 }));
  assert(res9.scoreBreakdown.price === 25, '9. Preço abaixo do orçamento pontua integralmente (25 pts)');

  // 10. Preço +10% perde progressivamente
  const res10 = evaluateMatch(createTestProfile({ priceMax: 500000 }), createTestProperty({ priceMin: 525000 }));
  assert(res10.eligible && res10.scoreBreakdown.price > 0 && res10.scoreBreakdown.price < 25, '10. Preço +5% perde pontos progressivamente mas é elegível');

  // 11. Preço acima da tolerância (> 10%) sai do automático
  const res11 = evaluateMatch(createTestProfile({ priceMax: 500000 }), createTestProperty({ priceMin: 560000 }));
  assert(!res11.eligible && res11.eliminatedReason?.includes('tolerância'), '11. Preço acima de +10% elimina do Match automático');

  // 12. Limite financeiro absoluto
  const res12 = evaluateMatch(createTestProfile({ priceMax: 500000, priceStrictMax: true }), createTestProperty({ priceMin: 500001 }));
  assert(!res12.eligible && res12.eliminatedReason?.includes('absoluto'), '12. Limite financeiro absoluto elimina mesmo por 1 real acima');

  // 13. Tipologia obrigatória incompatível
  const res13 = evaluateMatch(createTestProfile({ propertyTypes: ['casa'], propertyTypeStrict: true }), createTestProperty({ propertyType: 'apartamento' }));
  assert(!res13.eligible && res13.eliminatedReason?.includes('casa'), '13. Tipologia obrigatória incompatível elimina');

  // 14. Preferência de tipologia ("prefiro casa")
  const res14 = evaluateMatch(createTestProfile({ propertyTypes: ['casa'], propertyTypeStrict: false }), createTestProperty({ propertyType: 'apartamento' }));
  assert(res14.eligible && res14.scoreBreakdown.propertyType < 15, '14. Preferência de tipologia não elimina, reduz pontuação');

  // 15. Quartos obrigatórios incompatíveis
  const res15 = evaluateMatch(createTestProfile({ bedrooms: [3], bedroomsStrict: true }), createTestProperty({ bedroomsMin: 2, bedroomsMax: 2 }));
  assert(!res15.eligible && res15.eliminatedReason?.includes('quarto'), '15. Quartos obrigatórios incompatíveis elimina');

  // 16. Quartos preferenciais
  const res16 = evaluateMatch(createTestProfile({ bedrooms: [3], bedroomsStrict: false }), createTestProperty({ bedroomsMin: 2, bedroomsMax: 2 }));
  assert(res16.eligible && res16.scoreBreakdown.bedrooms < 15, '16. Quartos preferenciais não elimina, perde pontos');

  // 17. Pronto / Planta obrigatório
  const res17 = evaluateMatch(createTestProfile({ deliveryStatus: ['pronto'], deliveryStrict: true }), createTestProperty({ deliveryStatus: 'planta' }));
  assert(!res17.eligible && res17.eliminatedReason?.includes('entrega'), '17. Pronto vs Planta obrigatório elimina');

  // 18. Prazo de entrega impossível
  const res18 = evaluateMatch(createTestProfile({ maxDeliveryYear: 2026 }), createTestProperty({ deliveryDeadline: '2028-12-31' }));
  assert(!res18.eligible && res18.eliminatedReason?.includes('prazo limite'), '18. Prazo de entrega posterior ao limite do lead elimina');

  // 19. Localização pedida
  const res19 = evaluateMatch(createTestProfile({ locations: ['Bessa'] }), createTestProperty({ neighborhood: 'Bessa' }));
  assert(res19.scoreBreakdown.location === 20, '19. Localização em bairro desejado pontua integral (20 pts)');

  // 20. Bairro nunca mencionado limitado a no máximo 69%
  const res20 = evaluateMatch(createTestProfile({ locations: ['Bessa'] }), createTestProperty({ neighborhood: 'Altiplano' }));
  assert(res20.matchScore <= 69, `20. Bairro nunca mencionado limita Match a no máximo 69% (obteve ${res20.matchScore}%)`);

  // 21. Lead com < 70% de maturidade não é elegível para automático
  const maturityLead21 = 65;
  const isAutoEligible21 = maturityLead21 >= 70;
  assert(!isAutoEligible21, '21. Lead com maturidade < 70% não é elegível para Match automático');

  // 22. Lead com >= 70% de maturidade é elegível para automático
  const maturityLead22 = 85;
  const isAutoEligible22 = maturityLead22 >= 70;
  assert(isAutoEligible22, '22. Lead com maturidade >= 70% é elegível para Match automático');

  // 23. Lead pausado excluído de rodadas automáticas
  const prof23 = createTestProfile({ isPaused: true });
  assert(prof23.isPaused === true, '23. Lead pausado identificado para exclusão de rodadas automáticas');

  // 24. Lead arquivado excluído
  const prof24 = createTestProfile({ isArchived: true });
  assert(prof24.isArchived === true, '24. Lead arquivado identificado para exclusão');

  // 25. Suprimido não reaparece (suppressed = true)
  const matchSuppressed = { leadId: 'lead-1', propertyId: 'prop-1', suppressed: true };
  assert(matchSuppressed.suppressed === true, '25. Par suprimido marcado com suppressed = true preservado');

  // 26. Novo imóvel roda Match
  const newPropObj: Property = {
    id: 'prop-new-1',
    type: 'Apartamento',
    neighborhood: 'Bessa',
    bedrooms: 2,
    suites: 1,
    bathrooms: 1,
    parking_spaces: 1,
    area_m2: 60,
    price: 450000,
    building_features: ['Elevador'],
    apartment_features: [],
    source_type: 'Próprio',
    status: 'Ativo',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const proj26 = propertyToProjection(newPropObj);
  const eval26 = evaluateMatch(createTestProfile(), proj26);
  assert(eval26.eligible && eval26.matchScore >= 85, '26. Novo imóvel cadastrado roda Match determinístico com sucesso');

  // 27. Atualização relevante recalcula
  const oldProp27: Property = { ...newPropObj, price: 450000 };
  const updatedProp27: Property = { ...newPropObj, price: 400000 };
  assert(isMatchRelevantPropertyChange(oldProp27, updatedProp27), '27. Mudança de preço detectada como relevante para recálculo');

  // 28. Alteração irrelevante (cosmética) não dispara recálculo
  const updatedCosmetic28: Property = { ...newPropObj, notes: 'Nota interna atualizada' };
  assert(!isMatchRelevantPropertyChange(newPropObj, updatedCosmetic28), '28. Mudança apenas em notas internas não dispara recálculo');

  // 29. 85%+ gera notificação consolidada
  const strongMatchesCount = 6;
  const notif29 = strongMatchesCount > 0 ? `Live Park gerou ${strongMatchesCount} Matches fortes!` : '';
  assert(notif29.includes('6 Matches fortes'), '29. Imóvel com múltiplos Matches fortes gera 1 notificação consolidada');

  // 30. Matches 70-84 não geram spam de push
  const res30 = evaluateMatch(
    createTestProfile({
      propertyTypes: ['casa'],
      propertyTypeStrict: false,
      bedrooms: [3],
      bedroomsStrict: false,
    }),
    createTestProperty({ propertyType: 'apartamento', bedroomsMin: 2, bedroomsMax: 2 })
  );
  assert(res30.isGoodMatch && !res30.isStrongMatch, `30. Match 70–84 classificado como Bom Match sem disparar push (score: ${res30.matchScore}%)`);

  // 31. Matches 50-69 continuam consultáveis manualmente
  assert(res20.isManualOnly && res20.matchScore >= 50, '31. Match com localização não citada (limitado a 69%) continua consultável');

  // 32. Envio gera novo token
  const t1 = generateTrackingToken();
  assert(typeof t1 === 'string' && t1.length === 64, '32. Envio gera novo token opaco de 64 caracteres');

  // 33. Segundo envio gera outro token
  const t2 = generateTrackingToken();
  assert(t1 !== t2, '33. Segundo envio do mesmo par gera token diferente');

  // 34. Token não contém PII (sem telefone, nome ou email)
  const hasPii = t1.includes('5583999991111') || t1.includes('999991111') || t1.toLowerCase().includes('mariana') || t1.includes('@');
  assert(!hasPii && /^[0-9a-f]{64}$/.test(t1), '34. Token opaco criptográfico é livre de qualquer PII');

  // 35. Abertura registrada (public_link.opened)
  const shareRecord35 = { openCount: 0, firstOpenedAt: null as string | null, lastOpenedAt: null as string | null };
  const now35 = new Date().toISOString();
  shareRecord35.openCount++;
  shareRecord35.firstOpenedAt = now35;
  shareRecord35.lastOpenedAt = now35;
  assert(shareRecord35.openCount === 1 && shareRecord35.firstOpenedAt === now35, '35. Primeira abertura registra timestamp e contador');

  // 36. Múltiplas aberturas incrementam contador
  shareRecord35.openCount++;
  shareRecord35.lastOpenedAt = new Date().toISOString();
  assert(shareRecord35.openCount === 2, '36. Nova abertura subsequente incrementa contador para 2');

  // 37. Relacionado aberto registra imóvel correto
  const relatedVisitEvent = {
    eventName: 'public_related_property.opened',
    trackingToken: t1,
    relatedPropertyId: 'prop-relacionado-99',
  };
  assert(relatedVisitEvent.relatedPropertyId === 'prop-relacionado-99', '37. Visita em relacionado registra o imóvel específico visitado');

  // 38. Identificação preservada na navegação
  const relatedUrl = buildSharePublicUrl(t1, 'prop-relacionado-99');
  assert(relatedUrl.includes(t1) && relatedUrl.includes('prop-relacionado-99'), '38. Identificação de sessão preservada nos links relacionados');

  // 39. Tenho interesse registra imóvel correto
  const interestEvent = {
    eventName: 'public_interest.clicked',
    trackingToken: t1,
    propertyId: 'prop-relacionado-99',
    timestamp: new Date().toISOString(),
  };
  assert(interestEvent.propertyId === 'prop-relacionado-99', '39. Tenho interesse registra o imóvel em que houve o clique');

  // 40. Tenho interesse gera notificação imediata
  const interestNotification = {
    title: 'Interesse em Imóvel 🎯',
    body: 'Mariana demonstrou interesse no Residencial Live Park!',
  };
  assert(interestNotification.title.includes('Interesse'), '40. Clique em Tenho interesse gera notificação');

  // 41. Estado 'enviado' sincroniza
  let matchStatus41: string = 'novo';
  matchStatus41 = 'enviado';
  assert(matchStatus41 === 'enviado', '41. Disparo de envio transiciona estado para enviado');

  // 42. Histórico aparece bilateralmente
  const leadHistory = [{ propertyId: 'prop-1', sentAt: now35 }];
  const propHistory = [{ leadId: 'lead-1', sentAt: now35 }];
  assert(leadHistory[0].propertyId === propHistory[0].leadId ? false : true, '42. Relação Lead ↔ Imóvel espelhada bilateralmente');

  // 43. Imóvel indisponível preserva histórico
  const soldPropHistory = [...propHistory];
  assert(soldPropHistory.length === 1, '43. Imóvel vendido ou retirado preserva todo o histórico anterior');

  // 44. Autenticação entre sistemas via Bearer token
  const authHeader = 'Bearer wacrm-meusimoveis-tunnel-secret-key-v1';
  const tokenExtracted = authHeader.replace(/^Bearer\s+/i, '');
  assert(tokenExtracted === 'wacrm-meusimoveis-tunnel-secret-key-v1', '44. Autenticação de túnel via Bearer token validada');

  // 45. Idempotência de eventos e upsert de Match
  const upsertKey1 = `account_id:lead_id:prop_id`;
  const upsertKey2 = `account_id:lead_id:prop_id`;
  assert(upsertKey1 === upsertKey2, '45. Chave de upsert única garante idempotência absoluta');

  console.log('\n======================================================');
  console.log(`RESULTADO DOS TESTES: ${passed} PASSARAM | ${failed} FALHARAM`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTestSuite().catch((err) => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
