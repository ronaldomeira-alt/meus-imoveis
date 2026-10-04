import type {
  PropertyType,
  PropertyPosition,
  PropertyCondition,
  PropertyPurpose,
  FieldState,
  SourceType,
  DevelopmentStage,
  FeeStatus,
  DevelopmentTypology,
} from '../types/property';
import { normalizeAmenityList } from './amenity-normalization';

export interface ExtractedPropertyData {
  purpose?: PropertyPurpose | null;
  type?: PropertyType | null;
  neighborhood?: string | null;
  address?: string | null;
  number?: string | null;
  complement?: string | null;
  cep?: string | null;
  condominium_name?: string | null;
  internal_name?: string | null;
  title?: string | null;
  unit?: string | null;
  bedrooms?: number | null;
  suites?: number | null;
  bathrooms?: number | null;
  parking_spaces?: number | null;
  parking_spaces_type?: 'Rotativas' | null;
  area_m2?: number | null;
  is_approximate_area?: boolean;
  price?: number | null;
  is_approximate_price?: boolean;
  is_development?: boolean;
  area_range?: { min: number; max: number } | null;
  bedrooms_options?: number[] | null;
  stage?: DevelopmentStage | null;
  delivery_date?: string | null;
  incorporation_registration?: string | null;
  development_types?: PropertyType[] | null;
  suites_options?: number[] | null;
  bathrooms_options?: number[] | null;
  parking_options?: number[] | null;
  price_from?: number | null;
  price_to?: number | null;
  condo_status?: FeeStatus | null;
  iptu_status?: FeeStatus | null;
  typologies?: DevelopmentTypology[] | null;
  social_publications?: any;
  condo_fee?: number | null;
  condo_included?: boolean;
  condo_not_applicable?: boolean;
  iptu?: number | null;
  floor?: number | null;
  position?: PropertyPosition | null;
  furnished?: boolean | null;
  condition?: PropertyCondition | null;
  building_features?: string[];
  apartment_features?: string[];
  notes?: string;
  source_type?: SourceType;
  owner_name?: string | null;
  owner_phone?: string | null;
  partner_name?: string | null;
  partner_phone?: string | null;
  instagram_source_url?: string | null;

  // Metadados de validação e confiabilidade
  missing_mandatory?: string[];
  missing_desirable?: string[];
  field_states?: Record<string, FieldState>;
  ambiguous_fields?: string[];
}

import {
  validateRequiredPropertyFields,
  getMissingDesirableFields,
} from './property-validation';

export const validatePropertyExtraction = (
  data: Partial<ExtractedPropertyData>
): {
  missing_mandatory: string[];
  missing_desirable: string[];
  isComplete: boolean;
} => {
  const req = validateRequiredPropertyFields(data);
  const missing_desirable = getMissingDesirableFields(data);

  return {
    missing_mandatory: req.missingLabels,
    missing_desirable,
    isComplete: req.valid,
  };
};

export const extractPropertyWithGemini = async (
  text: string,
  _apiKey?: string
): Promise<ExtractedPropertyData> => {
  const textLower = text.toLowerCase();
  const field_states: Record<string, FieldState> = {};
  const ambiguous_fields: string[] = [];

  // 1. Finalidade (Venda vs Locação)
  let purpose: PropertyPurpose | null = null;
  if (
    textLower.includes('aluguel') ||
    textLower.includes('alugar') ||
    textLower.includes('locação') ||
    textLower.includes('locacao') ||
    textLower.includes('alugo') ||
    textLower.includes('/mês') ||
    textLower.includes('ao mês')
  ) {
    purpose = 'Locação';
    field_states.purpose = 'informed';
  } else if (
    textLower.includes('venda') ||
    textLower.includes('vender') ||
    textLower.includes('comprar') ||
    textLower.includes('à venda') ||
    textLower.includes('a venda') ||
    textLower.includes('vendo')
  ) {
    purpose = 'Venda';
    field_states.purpose = 'informed';
  } else {
    field_states.purpose = 'missing';
  }

  // 2. Bairro (RIGOROSO: somente se citado no texto, sem default para Bessa)
  const bairrosConhecidos = [
    'bessa',
    'manaíra',
    'manaira',
    'cabo branco',
    'intermares',
    'tambaú',
    'tambau',
    'aeroclube',
    'altiplano',
    'miramar',
    'estados',
    'jardim oceania',
    'ponta de campina',
    'bancários',
    'bancarios',
  ];
  let neighborhood: string | null = null;
  for (const b of bairrosConhecidos) {
    if (textLower.includes(b)) {
      neighborhood = b.charAt(0).toUpperCase() + b.slice(1);
      if (neighborhood === 'Manaira') neighborhood = 'Manaíra';
      if (neighborhood === 'Tambau') neighborhood = 'Tambaú';
      if (neighborhood === 'Bancarios') neighborhood = 'Bancários';
      field_states.neighborhood = 'informed';
      break;
    }
  }
  if (!neighborhood) {
    field_states.neighborhood = 'missing';
  }

  // 3. Tipo de Imóvel (RIGOROSO: somente se citado no texto)
  let type: PropertyType | null = null;
  if (textLower.includes('apartamento') || textLower.includes('apto')) type = 'Apartamento';
  else if (textLower.includes('studio')) type = 'Studio';
  else if (textLower.includes('flat')) type = 'Flat';
  else if (textLower.includes('cobertura')) type = 'Cobertura';
  else if (textLower.includes('casa')) type = 'Casa';
  else if (textLower.includes('terreno') || textLower.includes('lote')) type = 'Terreno';

  if (type) {
    field_states.type = 'informed';
  } else {
    field_states.type = 'missing';
  }

  // 4. Quartos e Suítes (sem defaults, com suporte a multiunidades / empreendimentos)
  let bedrooms: number | null = null;
  let bedrooms_options: number[] | null = null;
  let is_development =
    textLower.includes('empreendimento') ||
    textLower.includes('na planta') ||
    textLower.includes('lançamento') ||
    textLower.includes('lancamento') ||
    textLower.includes('unidades de');

  // Detecta opções de quartos como "1, 2 e 3 quartos", "2 ou 3 quartos", "1 e 2 quartos"
  const multiBedroomsMatch = textLower.match(/([1-4])\s*(?:,|\s*e|\s*ou)\s*([1-4])(?:\s*(?:e|ou|,)\s*([1-4]))?\s*(?:quartos?|qts?|dorms?)/);
  if (multiBedroomsMatch) {
    const rawOpts = [multiBedroomsMatch[1], multiBedroomsMatch[2], multiBedroomsMatch[3]]
      .filter(Boolean)
      .map((n) => parseInt(n, 10));
    const uniqueOpts = Array.from(new Set(rawOpts)).sort((a, b) => a - b);
    if (uniqueOpts.length > 1) {
      bedrooms_options = uniqueOpts;
      bedrooms = uniqueOpts[0]; // fallback escalar para o menor
      is_development = true;
      field_states.bedrooms = 'informed';
    }
  }

  if (!bedrooms_options) {
    const matchQuartos = textLower.match(/(\d+|um|dois|três|tres|quatro|cinco)\s*(?:quartos?|qts?|dorms?)/);
    if (matchQuartos) {
      const wordMap: Record<string, number> = { um: 1, dois: 2, três: 3, tres: 3, quatro: 4, cinco: 5 };
      bedrooms = wordMap[matchQuartos[1]] || parseInt(matchQuartos[1], 10) || null;
      field_states.bedrooms = 'informed';
    } else {
      field_states.bedrooms = 'missing';
    }
  }

  // Negações explícitas ("não tem suíte", "sem vaga"): resposta válida = 0, não "faltando"
  const isNegated = (subject: string) =>
    new RegExp(`(?:n[ãa]o (?:tem|possui|há)|sem)\\s+(?:\\w+\\s+){0,2}${subject}`).test(textLower);

  let suites: number | null = null;
  let suites_options: number[] | null = null;
  const multiSuitesMatch = textLower.match(/([0-3])\s*(?:,|\s*e|\s*ou)\s*([1-4])\s*su[íi]tes?/);
  if (multiSuitesMatch) {
    const opts = [parseInt(multiSuitesMatch[1], 10), parseInt(multiSuitesMatch[2], 10)].sort((a, b) => a - b);
    suites_options = Array.from(new Set(opts));
    suites = suites_options[0];
    field_states.suites = 'informed';
  } else {
    const matchSuites = textLower.match(/(\d+|uma?|dois|duas|três|tres|quatro)\s*su[íi]tes?/);
    if (matchSuites) {
      const wordMap: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, três: 3, tres: 3, quatro: 4 };
      suites = wordMap[matchSuites[1]] || parseInt(matchSuites[1], 10) || null;
      field_states.suites = 'informed';
    } else if (isNegated('su[íi]tes?')) {
      suites = 0;
      field_states.suites = 'informed';
    } else {
      field_states.suites = 'missing';
    }
  }

  // Banheiros
  let bathrooms: number | null = null;
  let bathrooms_options: number[] | null = null;
  const multiBathMatch = textLower.match(/([1-4])\s*(?:,|\s*e|\s*ou|-|a)\s*([1-5])\s*banheiros?/);
  if (multiBathMatch) {
    const opts = [parseInt(multiBathMatch[1], 10), parseInt(multiBathMatch[2], 10)].sort((a, b) => a - b);
    bathrooms_options = Array.from(new Set(opts));
    bathrooms = bathrooms_options[0];
    field_states.bathrooms = 'informed';
  } else {
    const matchBanheiros = textLower.match(/(\d+|um|dois|três|tres|quatro)\s*banheiros?/);
    if (matchBanheiros) {
      const wordMap: Record<string, number> = { um: 1, dois: 2, três: 3, tres: 3, quatro: 4 };
      bathrooms = wordMap[matchBanheiros[1]] || parseInt(matchBanheiros[1], 10) || null;
      field_states.bathrooms = 'informed';
    } else {
      field_states.bathrooms = 'missing';
    }
  }

  // Vagas
  let parking_spaces: number | null = null;
  let parking_options: number[] | null = null;
  const multiVagasMatch = textLower.match(/([0-3])\s*(?:,|\s*e|\s*ou|-|a)\s*([1-4])\s*(?:vagas?|garagens?)/);
  if (multiVagasMatch) {
    const opts = [parseInt(multiVagasMatch[1], 10), parseInt(multiVagasMatch[2], 10)].sort((a, b) => a - b);
    parking_options = Array.from(new Set(opts));
    parking_spaces = parking_options[0];
    field_states.parking_spaces = 'informed';
  } else {
    const matchVagas = textLower.match(/(\d+|uma?|dois|duas|três|tres)\s*(?:vagas?|garagens?)/);
    if (matchVagas) {
      const wordMap: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, três: 3, tres: 3 };
      parking_spaces = wordMap[matchVagas[1]] || parseInt(matchVagas[1], 10) || null;
      field_states.parking_spaces = 'informed';
    } else if (isNegated('vagas?|garagens?')) {
      parking_spaces = 0;
      field_states.parking_spaces = 'informed';
    } else {
      field_states.parking_spaces = 'missing';
    }
  }

  // 5. Área m² (com suporte a faixa ex: 19 a 39 m² ou 19–39 metros e incerteza)
  let area_m2: number | null = null;
  let area_range: { min: number; max: number } | null = null;
  let is_approximate_area = false;

  const matchAreaRange = textLower.match(/(?:de\s+)?(\d+)\s*(?:a|até|-)\s*(\d+)\s*(?:m²|m2|metros(?:\s*quadrados)?)/);
  if (matchAreaRange) {
    const min = parseInt(matchAreaRange[1], 10);
    const max = parseInt(matchAreaRange[2], 10);
    if (!isNaN(min) && !isNaN(max)) {
      area_range = { min: Math.min(min, max), max: Math.max(min, max) };
      area_m2 = area_range.min; // fallback escalar
      is_development = true;
      field_states.area_m2 = 'informed';
    }
  }

  if (!area_range) {
    if (
      textLower.includes('por volta de') ||
      textLower.includes('mais ou menos') ||
      textLower.includes('cerca de') ||
      textLower.includes('acho que') ||
      textLower.includes('uns')
    ) {
      is_approximate_area = true;
    }

    const matchArea = textLower.match(/(\d+)\s*(?:m²|m2|metros(?:\s*quadrados)?)/);
    if (matchArea) {
      area_m2 = parseInt(matchArea[1], 10);
      field_states.area_m2 = is_approximate_area ? 'ambiguous' : 'informed';
      if (is_approximate_area) ambiguous_fields.push('Área (aproximada)');
    } else {
      field_states.area_m2 = 'missing';
    }
  }

  // 6. Preço / Aluguel (NUNCA assume 450.000)
  let price: number | null = null;
  let is_approximate_price = false;
  if (
    textLower.includes('por volta de') ||
    textLower.includes('mais ou menos') ||
    textLower.includes('cerca de') ||
    textLower.includes('deve estar')
  ) {
    is_approximate_price = true;
  }

  // Detecta valores em mil ou números diretos
  const matchMil = textLower.match(/(?:r\$\s*|valor\s*(?:de)?\s*|por\s*)?(\d{2,4}(?:[.,]\d+)?)\s*(?:mil|k)/);
  if (matchMil) {
    const rawNum = parseFloat(matchMil[1].replace(',', '.'));
    if (!isNaN(rawNum)) price = Math.round(rawNum * 1000);
  } else {
    const matchReais = textLower.match(/(?:r\$\s*|valor\s*(?:de)?\s*|por\s*)(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d{4,8})/);
    if (matchReais) {
      const rawVal = matchReais[1].replace(/\./g, '').replace(',', '.');
      const parsedVal = parseFloat(rawVal);
      if (!isNaN(parsedVal) && parsedVal > 100) price = parsedVal;
    }
  }

  if (price !== null) {
    field_states.price = is_approximate_price ? 'ambiguous' : 'informed';
    if (is_approximate_price) ambiguous_fields.push('Preço/Valor (aproximado)');
    // Se preço foi informado e não havia finalidade, se > 50.000 geralmente é Venda, se < 20.000 com aluguel é Locação
    if (!purpose) {
      if (price > 50000) {
        purpose = 'Venda';
        field_states.purpose = 'informed';
      }
    }
  } else {
    field_states.price = 'missing';
  }

  // 7. Condomínio (Especial para locação com condomínio incluso, ou "não se aplica")
  let condo_fee: number | null = null;
  let condo_included = false;
  let condo_not_applicable = false;
  if (
    textLower.includes('com condomínio incluso') ||
    textLower.includes('com condominio incluso') ||
    textLower.includes('condomínio incluso') ||
    textLower.includes('já com condomínio') ||
    textLower.includes('ja com condominio') ||
    textLower.includes('com condomínio incluído')
  ) {
    condo_included = true;
    condo_fee = null;
    field_states.condo_fee = 'informed';
  } else if (
    /(?:n[ãa]o (?:tem|possui|paga)|sem)\s+(?:\w+\s+){0,2}condom[íi]nio/.test(textLower) ||
    textLower.includes('condomínio não se aplica') ||
    textLower.includes('condominio nao se aplica')
  ) {
    condo_not_applicable = true;
    condo_fee = null;
    field_states.condo_fee = 'informed';
  } else {
    const matchCondo = textLower.match(/condom[íi]nio\s*(?:de)?\s*(?:r\$\s*)?(\d{2,4})/);
    if (matchCondo) {
      condo_fee = parseInt(matchCondo[1], 10);
      field_states.condo_fee = 'informed';
    } else {
      field_states.condo_fee = 'missing';
    }
  }

  // 8. IPTU
  let iptu: number | null = null;
  const matchIptu = textLower.match(/iptu\s*(?:de)?\s*(?:r\$\s*)?(\d{2,5})/);
  if (matchIptu) {
    iptu = parseInt(matchIptu[1], 10);
    field_states.iptu = 'informed';
  } else {
    field_states.iptu = 'missing';
  }

  // 9. Posição solar (sem default)
  let position: PropertyPosition | null = null;
  if (textLower.includes('nascente') || textLower.includes('sol da manhã')) position = 'Nascente';
  else if (textLower.includes('poente') || textLower.includes('sol da tarde')) position = 'Poente';
  else if (textLower.includes('norte')) position = 'Norte';
  else if (textLower.includes('sul')) position = 'Sul';

  // 10. Características & Comodidades Canônicas
  const rawFeaturesFound: string[] = [];
  if (textLower.includes('piscina na cobertura') || textLower.includes('piscina no rooftop')) {
    rawFeaturesFound.push('piscina na cobertura');
  } else {
    if (textLower.includes('piscina')) rawFeaturesFound.push('Piscina');
    if (textLower.includes('rooftop')) rawFeaturesFound.push('Rooftop');
  }
  if (textLower.includes('academia')) rawFeaturesFound.push('Academia');
  if (/\belevador(es)?\b/.test(textLower)) rawFeaturesFound.push('Elevador');
  if (textLower.includes('portaria remota') || textLower.includes('portaria virtual') || textLower.includes('portaria eletrônica') || textLower.includes('portaria digital')) {
    rawFeaturesFound.push('Portaria virtual');
  } else if (textLower.includes('portaria') || textLower.includes('porteiro')) {
    rawFeaturesFound.push('Portaria física');
  }
  if (textLower.includes('salão de festas') || textLower.includes('salao de festas')) rawFeaturesFound.push('Salão de festas');
  if (textLower.includes('salão de jogos') || textLower.includes('salao de jogos')) rawFeaturesFound.push('Salão de jogos');
  if (textLower.includes('espaço gourmet') || textLower.includes('espaco gourmet') || textLower.includes('área gourmet')) rawFeaturesFound.push('Espaço gourmet');
  if (textLower.includes('minimercado') || textLower.includes('mini mercado')) rawFeaturesFound.push('Minimercado');
  if (textLower.includes('lavanderia')) rawFeaturesFound.push('Lavanderia');
  if (textLower.includes('cinema')) rawFeaturesFound.push('Cinema');
  if (textLower.includes('recepção') || textLower.includes('recepcao')) rawFeaturesFound.push('Recepção');
  if (textLower.includes('restaurante')) rawFeaturesFound.push('Restaurante');
  if (textLower.includes('escada') || textLower.includes('sem elevador')) rawFeaturesFound.push('Escada');

  if (textLower.includes('garagem privativa coberta') || textLower.includes('vaga coberta')) {
    if (!parking_spaces || parking_spaces === 0) {
      parking_spaces = 1;
      field_states.parking_spaces = 'informed';
    }
  }

  const apartment_features: string[] = [];
  if (textLower.includes('varanda')) apartment_features.push('Varanda gourmet');
  if (textLower.includes('vista mar') || textLower.includes('vista para o mar')) apartment_features.push('Vista mar');
  if (textLower.includes('ar-condicionado') || textLower.includes('ar condicionado')) apartment_features.push('Ar-condicionado');
  if (textLower.includes('projetado') || textLower.includes('planejado')) apartment_features.push('Móveis projetados');

  const normalized = normalizeAmenityList(rawFeaturesFound, {
    parking_spaces,
    apartment_features,
  });

  const building_features: string[] = normalized.building_features;
  if ((parking_spaces === null || parking_spaces === 0) && normalized.parking_spaces) {
    parking_spaces = normalized.parking_spaces;
    field_states.parking_spaces = 'informed';
  }
  if (normalized.apartment_features) {
    normalized.apartment_features.forEach((f) => {
      if (!apartment_features.includes(f)) apartment_features.push(f);
    });
  }

  // "Sem área de lazer" é uma resposta válida (não "faltando") — marca o campo como resolvido
  if (building_features.length > 0 || apartment_features.length > 0) {
    field_states.building_features = 'informed';
  } else if (
    /(?:n[ãa]o (?:tem|possui|há)|sem)\s+(?:\w+\s+){0,3}(?:lazer|comodidades?|[áa]rea de lazer)/.test(textLower)
  ) {
    building_features.push('Sem área de lazer');
    field_states.building_features = 'informed';
  }

  // 11. Observações e Notas (SEM POLUIÇÃO AUTOMÁTICA)
  // Só extrai se o usuário der comando explícito como:
  // "guarde nas observações que...", "anota aí que...", "observações: ...", "adicione na descrição que..."
  let notes: string | undefined = undefined;
  const explicitNoteMatch =
    text.match(/(?:guarde|coloque|anot[ea]|registr[ea]|observa[çc][ãa]o)\s*(?:nas?\s*)?(?:observa[çc][õo]es?|notas?|descri[çc][ãa]o)[:\s]+([^.\n]+)/i) ||
    text.match(/(?:observa[çc][õo]es?|anota[çc][õo]es?|descri[çc][ãa]o)[:\s]+([^.\n]+)/i);

  if (explicitNoteMatch && explicitNoteMatch[1]) {
    notes = explicitNoteMatch[1].trim();
  }

  // 12. Estágio, Previsão de Entrega e RI para Empreendimentos
  let stage: DevelopmentStage | null = null;
  if (textLower.includes('pré-lançamento') || textLower.includes('pre lancamento')) {
    stage = 'Pré-lançamento';
    is_development = true;
  } else if (textLower.includes('lançamento') || textLower.includes('lancamento')) {
    stage = 'Lançamento';
    is_development = true;
  } else if (textLower.includes('em construção') || textLower.includes('em construcao') || textLower.includes('em obra')) {
    stage = 'Em construção';
    is_development = true;
  } else if (textLower.includes('pronto para morar')) {
    stage = 'Pronto para morar';
  }

  let delivery_date: string | null = null;
  const matchDelivery = text.match(/(?:entrega|previsão de entrega|previsao de entrega|prazo de entrega|previsto para|conclusão em)[:\s]+([a-zA-Z0-9\s/.-]{3,25})/i);
  if (matchDelivery) {
    delivery_date = matchDelivery[1].trim();
    is_development = true;
  }

  let incorporation_registration: string | null = null;
  const matchRI = text.match(/(?:r\.?i\.?|registro de incorpora[çc][ãa]o)[:\s]+([a-zA-Z0-9\-./]{3,25})/i);
  if (matchRI) {
    incorporation_registration = matchRI[1].trim();
    is_development = true;
  }

  const price_from = is_development && price ? price : null;

  const resultData: ExtractedPropertyData = {
    purpose,
    type,
    neighborhood,
    bedrooms,
    bedrooms_options,
    suites,
    suites_options,
    bathrooms,
    bathrooms_options,
    parking_spaces,
    parking_options,
    area_m2,
    area_range,
    is_approximate_area,
    is_development,
    stage,
    delivery_date,
    incorporation_registration,
    price_from,
    price,
    is_approximate_price,
    condo_fee,
    condo_included,
    condo_not_applicable,
    iptu,
    position,
    furnished: textLower.includes('mobiliado') || textLower.includes('porteira fechada') ? true : null,
    condition: textLower.includes('novo') ? 'Novo' : textLower.includes('reformado') ? 'Reformado' : null,
    building_features,
    apartment_features,
    notes,
    source_type: textLower.includes('parceir') ? 'Parceiro' : 'Próprio',
    field_states,
    ambiguous_fields,
  };

  const validation = validatePropertyExtraction(resultData);
  resultData.missing_mandatory = validation.missing_mandatory;
  resultData.missing_desirable = validation.missing_desirable;

  return resultData;
};
