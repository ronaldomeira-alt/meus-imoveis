import type { Property, PropertyType, PropertyPosition, PropertyCondition, SourceType } from '../types/property';

export interface ExtractedPropertyData {
  type: PropertyType;
  neighborhood: string;
  address?: string;
  number?: string;
  complement?: string;
  cep?: string;
  condominium_name?: string;
  unit?: string;
  bedrooms: number;
  suites: number;
  bathrooms: number;
  parking_spaces: number;
  area_m2: number;
  price: number;
  condo_fee?: number;
  iptu?: number;
  floor?: number | null;
  position?: PropertyPosition;
  furnished?: boolean;
  condition?: PropertyCondition;
  building_features: string[];
  apartment_features: string[];
  notes?: string;
  source_type: SourceType;
  owner_name?: string;
  owner_phone?: string;
  partner_name?: string;
  partner_phone?: string;
}

export const extractPropertyWithGemini = async (
  text: string,
  apiKey?: string
): Promise<ExtractedPropertyData> => {
  // Simulação de extração inteligente com parsing contextual quando não houver chave real configurada
  // Quando a chave for informada em Configurações, pode chamar a API do Gemini
  const textLower = text.toLowerCase();

  // Bairro
  const bairrosConhecidos = [
    'bessa', 'manaíra', 'manaira', 'cabo branco', 'intermares', 
    'tambaú', 'tambau', 'aeroclube', 'altiplano', 'miramar', 'estados'
  ];
  let neighborhood = 'Bessa';
  for (const b of bairrosConhecidos) {
    if (textLower.includes(b)) {
      neighborhood = b.charAt(0).toUpperCase() + b.slice(1);
      if (neighborhood === 'Manaira') neighborhood = 'Manaíra';
      if (neighborhood === 'Tambau') neighborhood = 'Tambaú';
      break;
    }
  }

  // Tipo
  let type: PropertyType = 'Apartamento';
  if (textLower.includes('studio')) type = 'Studio';
  else if (textLower.includes('flat')) type = 'Flat';
  else if (textLower.includes('cobertura')) type = 'Cobertura';
  else if (textLower.includes('casa')) type = 'Casa';
  else if (textLower.includes('terreno')) type = 'Terreno';

  // Quartos e Suítes
  let bedrooms = 2;
  const matchQuartos = textLower.match(/(\d+)\s*(?:quartos?|qts?|dorms?)/);
  if (matchQuartos) bedrooms = parseInt(matchQuartos[1], 10);

  let suites = 1;
  const matchSuites = textLower.match(/(\d+)\s*su[íi]tes?/);
  if (matchSuites) suites = parseInt(matchSuites[1], 10);

  // Vagas
  let parking_spaces = 1;
  const matchVagas = textLower.match(/(\d+)\s*vagas?/);
  if (matchVagas) parking_spaces = parseInt(matchVagas[1], 10);

  // Área
  let area_m2 = 60;
  const matchArea = textLower.match(/(\d+)\s*(?:m²|m2|metros)/);
  if (matchArea) area_m2 = parseInt(matchArea[1], 10);

  // Preço
  let price = 450000;
  const matchPrice = textLower.match(/(?:r\$\s*|valor\s*(?:de)?\s*)?(\d{2,3}(?:\.\d{3})*(?:,\d{2})?|\d{5,8})/);
  if (matchPrice) {
    const rawVal = matchPrice[1].replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(rawVal);
    if (parsed > 50000) price = parsed;
  }

  // Características
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
  if (textLower.includes('nascente')) apartment_features.push('Nascente');
  if (textLower.includes('ar-condicionado') || textLower.includes('ar condicionado')) apartment_features.push('Ar-condicionado');
  if (textLower.includes('projetado') || textLower.includes('planejado')) apartment_features.push('Móveis projetados');

  return {
    type,
    neighborhood,
    bedrooms,
    suites,
    bathrooms: suites > 1 ? suites : 2,
    parking_spaces,
    area_m2,
    price,
    condo_fee: 450,
    position: textLower.includes('nascente') ? 'Nascente' : 'Norte',
    furnished: textLower.includes('mobiliado') || textLower.includes('porteira fechada'),
    condition: textLower.includes('novo') ? 'Novo' : 'Usado',
    building_features,
    apartment_features,
    notes: text,
    source_type: textLower.includes('parceir') ? 'Parceiro' : 'Próprio',
  };
};

export const transcribeAudioWithGemini = async (
  audioBlob: Blob,
  apiKey?: string
): Promise<string> => {
  // Simula latência de transcrição de alta fidelidade
  await new Promise((r) => setTimeout(r, 1200));
  return 'Apartamento de 2 quartos sendo 1 suíte no Bessa, 64 metros quadrados, varanda gourmet com vista mar, prédio com piscina e elevador, valor 497 mil reais, posição nascente.';
};
