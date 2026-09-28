import {
  validateRequiredPropertyFields,
} from '../src/lib/property-validation';
import { formatBedroomsOptions } from '../src/components/capture/PropertyFicha';
import { evaluateMatch } from '../src/lib/match/engine';
import { propertyToProjection, isMatchRelevantPropertyChange } from '../src/lib/match/property-adapter';
import { optimizeTextForTokenBudget, extractTextFromDocument } from '../src/lib/pdf-parser';
import type { LeadSearchProfile, PropertyProjection } from '../src/lib/match/types';
import type { Property } from '../src/types/property';

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ [PASS] ${testName}`);
  } else {
    failed++;
    console.error(`  ✗ [FAIL] ${testName}${details ? ` -> ${details}` : ''}`);
  }
}

async function runTests() {
  console.log('======================================================');
  console.log('TEST SUITE: FLUXO DE IMÓVEL PRONTO × EMPREENDIMENTO NA PLANTA');
  console.log('======================================================\n');

  // ------------------------------------------------------------------
  // 1. FORMATAÇÃO HUMANIZADA DE QUARTOS (formatBedroomsOptions)
  // ------------------------------------------------------------------
  console.log('--- 1. Formatação de Quartos ---');

  assert(formatBedroomsOptions([]) === '', 'Array vazio retorna string vazia');
  assert(formatBedroomsOptions(null as any) === '', 'Null/undefined retorna string vazia');
  assert(formatBedroomsOptions([0]) === 'Studio', 'Apenas [0] retorna "Studio"');
  assert(formatBedroomsOptions([1]) === '1 quarto', '[1] retorna "1 quarto"');
  assert(formatBedroomsOptions([2]) === '2 quartos', '[2] retorna "2 quartos"');
  assert(formatBedroomsOptions([0, 1]) === 'Studio e 1 quarto', '[0, 1] retorna "Studio e 1 quarto"');
  assert(formatBedroomsOptions([1, 2]) === '1 e 2 quartos', '[1, 2] retorna "1 e 2 quartos"');
  assert(formatBedroomsOptions([1, 2, 3]) === '1 a 3 quartos', 'Consecutivo [1, 2, 3] retorna "1 a 3 quartos"');
  assert(formatBedroomsOptions([0, 1, 2]) === 'Studio a 2 quartos', 'Consecutivo com Studio [0, 1, 2] retorna "Studio a 2 quartos"');
  assert(formatBedroomsOptions([0, 1, 2, 3]) === 'Studio a 3 quartos', 'Consecutivo com Studio [0, 1, 2, 3] retorna "Studio a 3 quartos"');
  assert(formatBedroomsOptions([0, 2, 3]) === 'Studio, 2 e 3 quartos', 'Não-consecutivo com Studio [0, 2, 3] retorna "Studio, 2 e 3 quartos"');
  assert(formatBedroomsOptions([1, 3]) === '1 e 3 quartos', 'Não-consecutivo [1, 3] retorna "1 e 3 quartos"');
  assert(formatBedroomsOptions([1, 3, 4]) === '1, 3 e 4 quartos', 'Não-consecutivo [1, 3, 4] retorna "1, 3 e 4 quartos"');

  // ------------------------------------------------------------------
  // 2. VALIDAÇÃO: IMÓVEL PRONTO (Zero Regressão)
  // ------------------------------------------------------------------
  console.log('\n--- 2. Validação: Imóvel Pronto ---');

  const emptyReady = validateRequiredPropertyFields({ is_development: false });
  assert(!emptyReady.valid, 'Imóvel pronto vazio é inválido');
  assert(emptyReady.missing.length === 5, 'Imóvel pronto vazio exige exatamente 5 campos obrigatórios');
  assert(
    emptyReady.missingLabels.includes('Bairro') &&
    emptyReady.missingLabels.includes('Valor do imóvel') &&
    emptyReady.missingLabels.includes('Quartos') &&
    emptyReady.missingLabels.includes('Área (m²)') &&
    emptyReady.missingLabels.includes('Tipo do imóvel'),
    'Imóvel pronto vazio lista os 5 campos obrigatórios corretos'
  );

  const completeReady = validateRequiredPropertyFields({
    is_development: false,
    neighborhood: 'Bessa',
    price: 450000,
    bedrooms: 2,
    area_m2: 65,
    type: 'Apartamento',
  });
  assert(completeReady.valid, 'Imóvel pronto completo é válido');
  assert(completeReady.missing.length === 0, 'Imóvel pronto completo tem 0 campos pendentes');

  // ------------------------------------------------------------------
  // 3. VALIDAÇÃO: EMPREENDIMENTO NA PLANTA
  // ------------------------------------------------------------------
  console.log('\n--- 3. Validação: Empreendimento na Planta ---');

  const emptyDev = validateRequiredPropertyFields({ is_development: true });
  assert(!emptyDev.valid, 'Empreendimento vazio é inválido');
  assert(
    emptyDev.missingLabels.includes('Nome do empreendimento') &&
    emptyDev.missingLabels.includes('Preço a partir de') &&
    emptyDev.missingLabels.includes('Previsão de entrega') &&
    emptyDev.missingLabels.includes('Área (mínima ou faixa)'),
    'Empreendimento vazio exige campos específicos da planta'
  );

  const completeDev = validateRequiredPropertyFields({
    is_development: true,
    condominium_name: 'Residencial Infinity Ocean',
    neighborhood: 'Cabo Branco',
    price_from: 350000,
    delivery_date: '12/2026',
    stage: 'Lançamento',
    development_types: ['Apartamento', 'Studio'],
    bedrooms_options: [0, 1, 2],
    suites_options: [0, 1],
    bathrooms_options: [1, 2],
    parking_options: [0, 1],
    area_range: { min: 28, max: 70 },
  });
  assert(completeDev.valid, 'Empreendimento preenchido com todos os campos é válido');
  assert(completeDev.missing.length === 0, 'Empreendimento válido tem 0 campos pendentes');

  // ------------------------------------------------------------------
  // 4. PARSER DE DOCUMENTOS E OTIMIZAÇÃO DE TOKENS (PDF, TXT, MD)
  // ------------------------------------------------------------------
  console.log('\n--- 4. Parser de Documentos & Otimização de Tokens ---');

  const longRawBookText = `
    APRESENTAÇÃO INSTITUCIONAL DA CONSTRUTORA
    Fundada em 2005, com mais de 50 obras entregues no estado da Paraíba. Nossa missão é conectar pessoas a lares extraordinários com pontualidade e excelência construtiva.

    RESIDENCIAL HORIZONTE DO BESSA - O SEU NOVO LANÇAMENTO
    Localizado a 150m da praia do Bessa em João Pessoa, o Residencial Horizonte é um lançamento exclusivo.
    Registro de Incorporação: R-3-128.450 do Cartório de Imóveis.
    Previsão de entrega para Dezembro de 2027.

    DETALHES DAS PLANTAS E METRAGENS
    Unidades com metragem de 28m² até 85m².
    Opções com Studios de 28m², apartamentos de 1 quarto com 42m², 2 quartos com 60m² (1 suíte) e 3 quartos com 85m² (2 suítes e 3 banheiros).
    Vagas de garagem: unidades com 1 ou 2 vagas privativas.

    VALORES E CONDIÇÕES COMERCIAIS
    Preços a partir de R$ 290.000 para Studios e até R$ 820.000 para 3 quartos.
    Condomínio estimado em R$ 380/mês.

    ÁREA DE LAZER COMPLETA
    Piscina aquecida com borda infinita, academia equipada, rooftop gourmet, salão de festas, minimercado e portaria 24h.

    TERMOS E CONDIÇÕES GERAIS DE CONTRATO
    O presente material é meramente ilustrativo. As fotos e imagens artísticas podem sofrer alterações conforme memorial descritivo. Os móveis e decorações não integram o contrato de compra e venda.
  `;

  const optimizedText = optimizeTextForTokenBudget(longRawBookText, 600);
  assert(optimizedText.length <= 600, 'Texto otimizado respeita o limite estrito de caracteres/tokens');
  assert(
    optimizedText.includes('RESIDENCIAL') ||
    optimizedText.includes('Preços a partir') ||
    optimizedText.includes('Studios') ||
    optimizedText.includes('metragem'),
    'Texto otimizado prioriza blocos com alta densidade de dados imobiliários'
  );

  // Teste de extração de arquivo MD/TXT
  const fakeFile = new File([longRawBookText], 'book-empreendimento.md', { type: 'text/markdown' });
  const parseResult = await extractTextFromDocument(fakeFile);
  assert(parseResult.success, 'Extração de texto via arquivo .md executada com sucesso');
  assert(Boolean(parseResult.text && parseResult.text.length > 50), 'Conteúdo textual estruturado extraído do arquivo');

  // ------------------------------------------------------------------
  // 5. ADAPTER DE PROJEÇÃO: MAPEAMENTO E DETECÇÃO DE MUDANÇAS
  // ------------------------------------------------------------------
  console.log('\n--- 5. Adapter de Projeção ---');

  const mockDevProperty: Property = {
    id: 'prop-dev-1',
    user_id: 'user-1',
    account_id: 'acc-1',
    code: 'EMP-01',
    title: 'Residencial Wave',
    condominium_name: 'Residencial Wave',
    is_development: true,
    stage: 'Lançamento',
    delivery_date: '2027-12-01',
    price: 270000,
    price_from: 270000,
    price_to: 790000,
    area_range: { min: 28, max: 85 },
    bedrooms_options: [0, 3],
    suites_options: [0, 2],
    bathrooms_options: [1, 3],
    parking_options: [0, 2],
    development_types: ['Apartamento', 'Studio'],
    neighborhood: 'Bessa',
    city: 'João Pessoa',
    purpose: 'Venda',
    type: 'Apartamento',
    building_features: [],
    apartment_features: [],
    source_type: 'Próprio',
    status: 'Ativo',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    typologies: [
      {
        id: 'typo-studio',
        title: 'Studio Master',
        type: 'Studio',
        bedrooms: 0,
        bathrooms: 1,
        area_min: 28,
        price_from: 270000,
      },
      {
        id: 'typo-3q',
        title: '3 Quartos Vista Mar',
        type: 'Apartamento',
        bedrooms: 3,
        suites: 2,
        bathrooms: 3,
        parking_spaces: 2,
        area_min: 85,
        price_from: 790000,
        price_to: 850000,
      },
    ],
  };

  const projection = propertyToProjection(mockDevProperty);
  assert(projection.isDevelopment === true, 'Projeção preserva flag isDevelopment');
  assert(projection.deliveryStatus === 'planta', 'Estágio "Lançamento" mapeia para deliveryStatus "planta"');
  assert(projection.typologies?.length === 2, 'Projeção mapeia tipologias');
  assert(projection.priceMin === 270000 && projection.priceMax === 790000, 'Faixas de preço mapeadas corretamente');
  assert(projection.typologies?.[1].bathrooms === 3, 'Tipologia preserva quantidade de banheiros');

  // Mudança relevante de tipologia
  const modifiedDevProperty: Property = {
    ...mockDevProperty,
    typologies: [
      ...mockDevProperty.typologies!,
      { id: 'typo-2q', title: '2 Quartos', type: 'Apartamento', bedrooms: 2, bathrooms: 2, area_min: 55, price_from: 450000 },
    ],
  };
  assert(
    isMatchRelevantPropertyChange(mockDevProperty, modifiedDevProperty),
    'Alteração nas tipologias dispara recálculo de Match'
  );

  // ------------------------------------------------------------------
  // 6. MOTOR DE MATCH: PREVENÇÃO DE FALSO POSITIVO ENTRE EXTREMOS
  // ------------------------------------------------------------------
  console.log('\n--- 6. Match Engine: Isolamento de Tipologias ---');

  // Lead A: Busca 3 quartos estrito, orçamento R$ 400.000
  const leadQuartos3ComPoucoBudget: LeadSearchProfile = {
    accountId: 'acc-1',
    leadId: 'lead-3q-400k',
    name: 'Carlos Oliveira',
    phone: '5583999990001',
    aiScore: 9,
    isPaused: false,
    isArchived: false,
    operation: 'venda',
    purpose: ['moradia'],
    propertyTypes: ['apartamento'],
    propertyTypeStrict: false,
    locations: ['Bessa'],
    locationStrict: false,
    locationSpecificity: 'neighborhood',
    priceMin: 250000,
    priceMax: 400000,
    priceStrictMax: true,
    priceFlexMax: 400000,
    bedrooms: [3],
    bedroomsStrict: true,
    deliveryStatus: ['pronto', 'em_construcao', 'planta'],
    deliveryStrict: false,
    requiredFeatures: [],
    preferredFeatures: [],
    isShortStayOnly: false,
    provenance: { operation: 'conversation' },
  };

  const matchResultLeadA = evaluateMatch(leadQuartos3ComPoucoBudget, projection);
  assert(
    !matchResultLeadA.eligible,
    'Lead buscando 3Q com R$ 400k é ELIMINADO de empreendimento com Studio a 270k e 3Q a 790k (prevenção de falso positivo)'
  );
  assert(
    Boolean(matchResultLeadA.eliminatedReason && (matchResultLeadA.eliminatedReason.includes('orçamento') || matchResultLeadA.eliminatedReason.includes('tipologia') || matchResultLeadA.eliminatedReason.includes('R$'))),
    `Motivo de eliminação claro e explicativo: "${matchResultLeadA.eliminatedReason}"`
  );

  // Lead B: Busca 3 quartos, orçamento R$ 850.000 (compatível com Typology B)
  const leadQuartos3ComBudgetAlto: LeadSearchProfile = {
    ...leadQuartos3ComPoucoBudget,
    leadId: 'lead-3q-850k',
    name: 'Renata Albuquerque',
    priceMax: 850000,
    priceFlexMax: 900000,
  };

  const matchResultLeadB = evaluateMatch(leadQuartos3ComBudgetAlto, projection);
  assert(
    matchResultLeadB.eligible,
    'Lead buscando 3Q com R$ 850k é ELEGÍVEL contra o mesmo empreendimento via tipologia 3Q'
  );
  assert(
    matchResultLeadB.matchScore >= 80,
    `Match atinge pontuação alta compatível (score obtido: ${matchResultLeadB.matchScore}%)`
  );

  // Lead C: Busca Studio, orçamento R$ 300.000 (compatível com Typology A)
  const leadStudio: LeadSearchProfile = {
    ...leadQuartos3ComPoucoBudget,
    leadId: 'lead-studio-300k',
    name: 'Felipe Santos',
    propertyTypes: ['studio', 'apartamento'],
    priceMax: 300000,
    priceFlexMax: 320000,
    bedrooms: [0], // Studio
    bedroomsStrict: true,
  };

  const matchResultLeadC = evaluateMatch(leadStudio, projection);
  assert(
    matchResultLeadC.eligible,
    'Lead buscando Studio com R$ 300k é ELEGÍVEL via tipologia Studio a R$ 270k'
  );

  console.log('\n======================================================');
  console.log(`TOTAL: ${passed} PASSARAM | ${failed} FALHARAM`);
  console.log('======================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Erro na execução dos testes:', err);
  process.exit(1);
});
