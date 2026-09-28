/**
 * REGRA DE NEGÓCIO CENTRAL:
 * "Um imóvel não pode ser adicionado ao estoque sem bairro, valor, quartos, área e tipo."
 *
 * Somente estes 5 campos são oficiais e OBRIGATÓRIOS:
 * 1. Bairro (neighborhood)
 * 2. Valor do imóvel (price)
 * 3. Quartos (bedrooms)
 * 4. Área / Metragem (area_m2)
 * 5. Tipo do imóvel (type)
 *
 * Todos os demais campos são opcionais/desejáveis:
 * condomínio, IPTU, suítes, banheiros, vagas, salas, andar, posição solar,
 * condição, mobiliado, varanda, piscina, elevador, endereço, proprietário, parceiro, etc.
 */

export type MandatoryPropertyFieldKey =
  | 'neighborhood'
  | 'price'
  | 'bedrooms'
  | 'area_m2'
  | 'type'
  | 'condominium_name'
  | 'delivery_date';

export interface RequiredFieldsValidationResult {
  valid: boolean;
  missing: MandatoryPropertyFieldKey[];
  missingLabels: string[];
  errors: Partial<Record<MandatoryPropertyFieldKey, string>>;
}

export const MANDATORY_FIELD_KEYS: MandatoryPropertyFieldKey[] = [
  'neighborhood',
  'price',
  'bedrooms',
  'area_m2',
  'type',
];

export const MANDATORY_DEVELOPMENT_FIELD_KEYS: MandatoryPropertyFieldKey[] = [
  'neighborhood',
  'condominium_name',
  'price',
  'bedrooms',
  'area_m2',
  'type',
  'delivery_date',
];

export const MANDATORY_FIELD_LABELS: Record<MandatoryPropertyFieldKey, string> = {
  neighborhood: 'Bairro',
  price: 'Valor do imóvel',
  bedrooms: 'Quartos',
  area_m2: 'Área (m²)',
  type: 'Tipo do imóvel',
  condominium_name: 'Nome do empreendimento',
  delivery_date: 'Previsão de entrega',
};

export const MANDATORY_DEVELOPMENT_FIELD_LABELS: Record<MandatoryPropertyFieldKey, string> = {
  neighborhood: 'Bairro',
  condominium_name: 'Nome do empreendimento',
  price: 'Preço a partir de',
  bedrooms: 'Opções de quartos',
  area_m2: 'Área (mínima ou faixa)',
  type: 'Tipo(s) do empreendimento',
  delivery_date: 'Previsão de entrega',
};

export const MANDATORY_FIELD_ERROR_MESSAGES: Record<MandatoryPropertyFieldKey, string> = {
  neighborhood: 'Informe o bairro.',
  price: 'Informe o valor do imóvel.',
  bedrooms: 'Informe a quantidade de quartos.',
  area_m2: 'Informe a área (m²).',
  type: 'Selecione o tipo do imóvel.',
  condominium_name: 'Informe o nome do empreendimento.',
  delivery_date: 'Informe a previsão de entrega (mês/ano).',
};

export const MANDATORY_DEVELOPMENT_FIELD_ERROR_MESSAGES: Record<MandatoryPropertyFieldKey, string> = {
  neighborhood: 'Informe o bairro do empreendimento.',
  condominium_name: 'Informe o nome do empreendimento ou condomínio.',
  price: 'Informe o preço a partir de (R$).',
  bedrooms: 'Selecione ao menos uma opção de quartos.',
  area_m2: 'Informe a metragem mínima ou faixa de área.',
  type: 'Selecione ao menos um tipo de imóvel.',
  delivery_date: 'Informe a previsão de entrega do empreendimento.',
};

/**
 * Função única central de validação de campos obrigatórios.
 * Diferencia null / undefined / "" de valores numéricos válidos (ex: quartos = 0 pode ser válido em studios/salas).
 */
export const validateRequiredPropertyFields = (
  data: Record<string, any>,
  isDevelopmentOverride?: boolean
): RequiredFieldsValidationResult => {
  const isDev = isDevelopmentOverride !== undefined ? isDevelopmentOverride : Boolean(data.is_development);
  const missing: MandatoryPropertyFieldKey[] = [];
  const errors: Partial<Record<MandatoryPropertyFieldKey, string>> = {};

  const labels = isDev ? MANDATORY_DEVELOPMENT_FIELD_LABELS : MANDATORY_FIELD_LABELS;
  const messages = isDev ? MANDATORY_DEVELOPMENT_FIELD_ERROR_MESSAGES : MANDATORY_FIELD_ERROR_MESSAGES;

  // 1. BAIRRO: texto não vazio
  const rawNeighborhood = data.neighborhood;
  if (!rawNeighborhood || typeof rawNeighborhood !== 'string' || !rawNeighborhood.trim()) {
    missing.push('neighborhood');
    errors.neighborhood = messages.neighborhood;
  }

  // 1.1 Se for empreendimento, Nome do Empreendimento é obrigatório
  if (isDev) {
    const rawDevName = data.condominium_name || data.internal_name || data.title;
    if (!rawDevName || typeof rawDevName !== 'string' || !rawDevName.trim()) {
      missing.push('condominium_name');
      errors.condominium_name = messages.condominium_name;
    }
  }

  // 2. VALOR DO IMÓVEL: número estritamente positivo (> 0)
  const rawPrice = isDev ? (data.price_from ?? data.price) : data.price;
  let numPrice: number | null = null;
  if (typeof rawPrice === 'number') {
    numPrice = isNaN(rawPrice) ? null : rawPrice;
  } else if (typeof rawPrice === 'string' && rawPrice.trim() !== '') {
    const cleaned = rawPrice.replace(/[^\d.,]/g, '').trim();
    if (cleaned.includes('.') && cleaned.includes(',')) {
      numPrice = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    } else if (cleaned.includes(',')) {
      numPrice = parseFloat(cleaned.replace(',', '.'));
    } else {
      numPrice = parseFloat(cleaned);
    }
  }

  if (numPrice === null || isNaN(numPrice) || numPrice <= 0) {
    missing.push('price');
    errors.price = messages.price;
  }

  // 3. QUARTOS: número >= 0 ou opções de quartos (empreendimentos)
  let hasValidBedrooms = false;
  if (isDev) {
    const hasBedroomsOptions =
      Array.isArray(data.bedrooms_options) &&
      data.bedrooms_options.length > 0 &&
      data.bedrooms_options.some((n: any) => typeof n === 'number' && !isNaN(n) && n >= 0);
    const hasTypologyBedrooms =
      Array.isArray(data.typologies) &&
      data.typologies.length > 0 &&
      data.typologies.some((t: any) => typeof t.bedrooms === 'number' && !isNaN(t.bedrooms) && t.bedrooms >= 0);
    const rawBedrooms = data.bedrooms;
    const numBedrooms =
      typeof rawBedrooms === 'number'
        ? rawBedrooms
        : typeof rawBedrooms === 'string' && rawBedrooms.trim() !== ''
        ? parseInt(rawBedrooms, 10)
        : null;
    hasValidBedrooms = hasBedroomsOptions || hasTypologyBedrooms || (numBedrooms !== null && !isNaN(numBedrooms) && numBedrooms >= 0);
  } else {
    const rawBedrooms = data.bedrooms;
    let numBedrooms: number | null = null;
    if (typeof rawBedrooms === 'number') {
      numBedrooms = isNaN(rawBedrooms) ? null : rawBedrooms;
    } else if (typeof rawBedrooms === 'string' && rawBedrooms.trim() !== '') {
      const parsed = parseInt(rawBedrooms, 10);
      numBedrooms = isNaN(parsed) ? null : parsed;
    }
    const hasBedroomsOptions =
      Array.isArray(data.bedrooms_options) &&
      data.bedrooms_options.length > 0 &&
      data.bedrooms_options.some((n: any) => typeof n === 'number' && !isNaN(n) && n >= 0);
    hasValidBedrooms = (numBedrooms !== null && !isNaN(numBedrooms) && numBedrooms >= 0) || hasBedroomsOptions;
  }

  if (!hasValidBedrooms) {
    missing.push('bedrooms');
    errors.bedrooms = messages.bedrooms;
  }

  // 4. ÁREA / METRAGEM: número estritamente positivo (> 0) ou faixa de área (empreendimentos)
  let hasValidArea = false;
  if (isDev) {
    const hasAreaRange =
      data.area_range &&
      ((typeof data.area_range.min === 'number' && data.area_range.min > 0) ||
        (typeof data.area_range.max === 'number' && data.area_range.max > 0));
    const hasTypologyArea =
      Array.isArray(data.typologies) &&
      data.typologies.length > 0 &&
      data.typologies.some(
        (t: any) =>
          (typeof t.area_min === 'number' && t.area_min > 0) ||
          (typeof t.area_max === 'number' && t.area_max > 0)
      );
    const rawArea = data.area_m2;
    let numArea: number | null = null;
    if (typeof rawArea === 'number') {
      numArea = isNaN(rawArea) ? null : rawArea;
    } else if (typeof rawArea === 'string' && rawArea.trim() !== '') {
      const parsed = parseFloat(rawArea.replace(',', '.'));
      numArea = isNaN(parsed) ? null : parsed;
    }
    hasValidArea = (numArea !== null && !isNaN(numArea) && numArea > 0) || Boolean(hasAreaRange) || hasTypologyArea;
  } else {
    const rawArea = data.area_m2;
    let numArea: number | null = null;
    if (typeof rawArea === 'number') {
      numArea = isNaN(rawArea) ? null : rawArea;
    } else if (typeof rawArea === 'string' && rawArea.trim() !== '') {
      const parsed = parseFloat(rawArea.replace(',', '.'));
      numArea = isNaN(parsed) ? null : parsed;
    }
    const hasAreaRange =
      data.area_range &&
      ((typeof data.area_range.min === 'number' && data.area_range.min > 0) ||
        (typeof data.area_range.max === 'number' && data.area_range.max > 0));
    hasValidArea = (numArea !== null && !isNaN(numArea) && numArea > 0) || Boolean(hasAreaRange);
  }

  if (!hasValidArea) {
    missing.push('area_m2');
    errors.area_m2 = messages.area_m2;
  }

  // 5. TIPO DO IMÓVEL: string válida ou array de tipos
  let hasValidType = false;
  if (isDev) {
    const hasDevTypes = Array.isArray(data.development_types) && data.development_types.length > 0;
    const rawType = data.type;
    const hasSingleType = Boolean(rawType && typeof rawType === 'string' && rawType.trim());
    hasValidType = hasDevTypes || hasSingleType;
  } else {
    const rawType = data.type;
    hasValidType = Boolean(rawType && typeof rawType === 'string' && rawType.trim());
  }

  if (!hasValidType) {
    missing.push('type');
    errors.type = messages.type;
  }

  // 6. PREVISÃO DE ENTREGA (obrigatório para empreendimento)
  if (isDev) {
    const rawDelivery = data.delivery_date;
    if (!rawDelivery || typeof rawDelivery !== 'string' || !rawDelivery.trim()) {
      missing.push('delivery_date');
      errors.delivery_date = messages.delivery_date;
    }
  }

  return {
    valid: missing.length === 0,
    missing,
    missingLabels: missing.map((k) => labels[k]),
    errors,
  };
};

/**
 * Retorna lista de campos desejáveis (opcionais) que ainda não foram preenchidos.
 */
export const getMissingDesirableFields = (data: Record<string, any>): string[] => {
  const isDev = Boolean(data.is_development);
  const desirable: string[] = [];

  if (isDev) {
    if (!data.stage) desirable.push('Estágio da obra');
    if (!data.suites_options || data.suites_options.length === 0) desirable.push('Opções de suítes');
    if (!data.parking_options || data.parking_options.length === 0) desirable.push('Opções de vagas');
    if (!data.incorporation_registration) desirable.push('Registro de Incorporação (RI)');
    if (!data.building_features || data.building_features.length === 0) desirable.push('Lazer e infraestrutura');
    return desirable;
  }

  if (data.suites === undefined || data.suites === null || data.suites === '') {
    desirable.push('Suítes');
  }
  if (data.bathrooms === undefined || data.bathrooms === null || data.bathrooms === '') {
    desirable.push('Banheiros');
  }
  if (data.parking_spaces === undefined || data.parking_spaces === null || data.parking_spaces === '' && data.parking_spaces_type !== 'Rotativas') {
    desirable.push('Vagas de garagem');
  }
  if (
    !data.condo_fee &&
    !data.condo_included &&
    !data.condo_not_applicable &&
    (data.type === 'Apartamento' || data.type === 'Flat' || data.type === 'Studio')
  ) {
    desirable.push('Taxa de condomínio');
  }
  if (!data.position) desirable.push('Posição solar');
  if (!data.condition) desirable.push('Condição do imóvel');
  if (data.furnished === null || data.furnished === undefined) desirable.push('Mobiliado');

  return desirable;
};
