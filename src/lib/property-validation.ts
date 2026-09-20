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
  | 'type';

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

export const MANDATORY_FIELD_LABELS: Record<MandatoryPropertyFieldKey, string> = {
  neighborhood: 'Bairro',
  price: 'Valor do imóvel',
  bedrooms: 'Quartos',
  area_m2: 'Área (m²)',
  type: 'Tipo do imóvel',
};

export const MANDATORY_FIELD_ERROR_MESSAGES: Record<MandatoryPropertyFieldKey, string> = {
  neighborhood: 'Informe o bairro.',
  price: 'Informe o valor do imóvel.',
  bedrooms: 'Informe a quantidade de quartos.',
  area_m2: 'Informe a área (m²).',
  type: 'Selecione o tipo do imóvel.',
};

/**
 * Função única central de validação de campos obrigatórios.
 * Diferencia null / undefined / "" de valores numéricos válidos (ex: quartos = 0 pode ser válido em studios/salas).
 */
export const validateRequiredPropertyFields = (
  data: Record<string, any>
): RequiredFieldsValidationResult => {
  const missing: MandatoryPropertyFieldKey[] = [];
  const errors: Partial<Record<MandatoryPropertyFieldKey, string>> = {};

  // 1. BAIRRO: texto não vazio
  const rawNeighborhood = data.neighborhood;
  if (!rawNeighborhood || typeof rawNeighborhood !== 'string' || !rawNeighborhood.trim()) {
    missing.push('neighborhood');
    errors.neighborhood = MANDATORY_FIELD_ERROR_MESSAGES.neighborhood;
  }

  // 2. VALOR DO IMÓVEL: número estritamente positivo (> 0)
  const rawPrice = data.price;
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
    errors.price = MANDATORY_FIELD_ERROR_MESSAGES.price;
  }

  // 3. QUARTOS: número >= 0 (não confundir 'vazio' com 0)
  const rawBedrooms = data.bedrooms;
  let numBedrooms: number | null = null;
  if (typeof rawBedrooms === 'number') {
    numBedrooms = isNaN(rawBedrooms) ? null : rawBedrooms;
  } else if (typeof rawBedrooms === 'string' && rawBedrooms.trim() !== '') {
    const parsed = parseInt(rawBedrooms, 10);
    numBedrooms = isNaN(parsed) ? null : parsed;
  }

  if (numBedrooms === null || isNaN(numBedrooms) || numBedrooms < 0) {
    missing.push('bedrooms');
    errors.bedrooms = MANDATORY_FIELD_ERROR_MESSAGES.bedrooms;
  }

  // 4. ÁREA / METRAGEM: número estritamente positivo (> 0)
  const rawArea = data.area_m2;
  let numArea: number | null = null;
  if (typeof rawArea === 'number') {
    numArea = isNaN(rawArea) ? null : rawArea;
  } else if (typeof rawArea === 'string' && rawArea.trim() !== '') {
    const parsed = parseFloat(rawArea.replace(',', '.'));
    numArea = isNaN(parsed) ? null : parsed;
  }

  if (numArea === null || isNaN(numArea) || numArea <= 0) {
    missing.push('area_m2');
    errors.area_m2 = MANDATORY_FIELD_ERROR_MESSAGES.area_m2;
  }

  // 5. TIPO DO IMÓVEL: string válida
  const rawType = data.type;
  if (!rawType || typeof rawType !== 'string' || !rawType.trim()) {
    missing.push('type');
    errors.type = MANDATORY_FIELD_ERROR_MESSAGES.type;
  }

  return {
    valid: missing.length === 0,
    missing,
    missingLabels: missing.map((k) => MANDATORY_FIELD_LABELS[k]),
    errors,
  };
};

/**
 * Retorna lista de campos desejáveis (opcionais) que ainda não foram preenchidos.
 */
export const getMissingDesirableFields = (data: Record<string, any>): string[] => {
  const desirable: string[] = [];

  if (data.suites === undefined || data.suites === null || data.suites === '') {
    desirable.push('Suítes');
  }
  if (data.bathrooms === undefined || data.bathrooms === null || data.bathrooms === '') {
    desirable.push('Banheiros');
  }
  if (data.parking_spaces === undefined || data.parking_spaces === null || data.parking_spaces === '') {
    desirable.push('Vagas de garagem');
  }
  if (
    !data.condo_fee &&
    !data.condo_included &&
    (data.type === 'Apartamento' || data.type === 'Flat' || data.type === 'Studio')
  ) {
    desirable.push('Taxa de condomínio');
  }
  if (!data.position) desirable.push('Posição solar');
  if (!data.condition) desirable.push('Condição do imóvel');
  if (data.furnished === null || data.furnished === undefined) desirable.push('Mobiliado');

  return desirable;
};
