import type {
  PropertyType,
  PropertyPosition,
  PropertyCondition,
  PropertyPurpose,
  FieldState,
  SourceType,
} from '../types/property';

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

  // Banheiros (somente se dito explicitamente, sem inventar suites > 1 ? suites : 2)
  let bathrooms: number | null = null;
  const matchBanheiros = textLower.match(/(\d+|um|dois|três|tres|quatro)\s*banheiros?/);
  if (matchBanheiros) {
    const wordMap: Record<string, number> = { um: 1, dois: 2, três: 3, tres: 3, quatro: 4 };
    bathrooms = wordMap[matchBanheiros[1]] || parseInt(matchBanheiros[1], 10) || null;
    field_states.bathrooms = 'informed';
  } else {
    field_states.bathrooms = 'missing';
  }

  // Vagas
  let parking_spaces: number | null = null;
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

  // 10. Características
  const building_features: string[] = [];
  if (textLower.includes('piscina')) building_features.push('Piscina');
  if (textLower.includes('academia')) building_features.push('Academia');
  if (textLower.includes('elevador')) building_features.push('Elevador');
  if (textLower.includes('portaria')) building_features.push('Portaria 24h');
  if (textLower.includes('salão de festas') || textLower.includes('salao de festas')) building_features.push('Salão de festas');
  if (textLower.includes('rooftop')) building_features.push('Rooftop');
  if (textLower.includes('espaço gourmet') || textLower.includes('espaco gourmet')) building_features.push('Espaço gourmet');

  const apartment_features: string[] = [];
  if (textLower.includes('varanda')) apartment_features.push('Varanda gourmet');
  if (textLower.includes('vista mar') || textLower.includes('vista para o mar')) apartment_features.push('Vista mar');
  if (textLower.includes('ar-condicionado') || textLower.includes('ar condicionado')) apartment_features.push('Ar-condicionado');
  if (textLower.includes('projetado') || textLower.includes('planejado')) apartment_features.push('Móveis projetados');

  // "Sem área de lazer" é uma resposta válida (não "faltando") — marca o campo como resolvido
  if (building_features.length > 0 || apartment_features.length > 0) {
    field_states.building_features = 'informed';
  } else if (
    /(?:n[ãa]o (?:tem|possui|há)|sem)\s+(?:\w+\s+){0,3}(?:lazer|comodidades?|[áa]rea de lazer)/.test(textLower)
  ) {
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

  const resultData: ExtractedPropertyData = {
    purpose,
    type,
    neighborhood,
    bedrooms,
    bedrooms_options,
    suites,
    bathrooms,
    parking_spaces,
    area_m2,
    area_range,
    is_approximate_area,
    is_development,
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

const blobToBase64 = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = reader.result as string;
      const base64 = res.includes(',') ? res.split(',')[1] : res;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
};

export const transcribeAudioWithGemini = async (
  audioBlob: Blob,
  apiKey?: string,
  fallbackSpokenText?: string
): Promise<string> => {
  // Se o Web Speech API capturou fala nativamente com fidelidade, preservamos
  const speechFallback = fallbackSpokenText?.trim() || '';

  // Higieniza o MIME type para envio seguro à API (remove parâmetros de codecs)
  let cleanMime = (audioBlob.type || 'audio/webm').split(';')[0].trim().toLowerCase();
  if (cleanMime === 'audio/x-m4a') cleanMime = 'audio/mp4';

  if (apiKey && apiKey.trim().length > 10) {
    try {
      const base64Audio = await blobToBase64(audioBlob);
      // Testa modelos compatíveis com multimodalidade
      const modelsToTry = ['gemini-3.6-flash', 'gemini-1.5-flash', 'gemini-2.0-flash'];

      for (const model of modelsToTry) {
        try {
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey.trim()}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [
                  {
                    parts: [
                      {
                        text: 'Transcreva com máxima precisão todo o áudio a seguir em português do Brasil. Retorne estritamente o texto falado, sem comentários, sem aspas e sem explicações. Se não houver fala discernível ou for silêncio, responda exatamente: [SILENCIO]',
                      },
                      {
                        inlineData: {
                          mimeType: cleanMime,
                          data: base64Audio,
                        },
                      },
                    ],
                  },
                ],
              }),
            }
          );

          if (response.ok) {
            const data = await response.json();
            const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
            if (text && !text.includes('[SILENCIO]')) {
              return text;
            }
          }
        } catch {
          // Continua para o próximo modelo se este falhar
        }
      }
    } catch (apiErr) {
      console.warn('Falha na chamada direta à Google AI API:', apiErr);
    }
  }

  // Fallback para o reconhecimento nativo do navegador (Web Speech API)
  if (speechFallback) {
    return speechFallback;
  }

  // Se nada foi capturado
  throw new Error('Nenhuma fala foi identificada na gravação. Tente falar mais perto do microfone ou digite o texto.');
};
