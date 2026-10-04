import type {
  PropertyPosition,
  PropertyCondition,
  PropertyPurpose,
  FieldState,
  SourceType,
  DevelopmentStage,
} from '../types/property';
import { type ExtractedPropertyData, validatePropertyExtraction } from './gemini';
import { normalizeAmenityList } from './amenity-normalization';

export function normalizeExtractedProperty(parsed: Record<string, any>, text = ''): ExtractedPropertyData {

  const parseNullableNumber = (val: any): number | null => {
    if (val === null || val === undefined || val === '') return null;
    if (typeof val === 'number') return isNaN(val) ? null : val;
    if (typeof val === 'string') {
      const raw = val.trim().toLowerCase();
      if (!raw || raw === 'null' || raw === 'undefined') return null;

      const milMatch = raw.match(/^([\d.,]+)\s*(?:mil|k)$/);
      if (milMatch) {
        const base = parseFloat(milMatch[1].replace(',', '.'));
        return isNaN(base) ? null : Math.round(base * 1000);
      }
      const miMatch = raw.match(/^([\d.,]+)\s*(?:mi|milh[aã]o|milh[oõ]es)$/);
      if (miMatch) {
        const base = parseFloat(miMatch[1].replace(',', '.'));
        return isNaN(base) ? null : Math.round(base * 1000000);
      }

      const cleaned = raw.replace(/[^\d.,]/g, '').trim();
      if (!cleaned) return null;

      if (cleaned.includes('.') && cleaned.includes(',')) {
        const normalized = cleaned.replace(/\./g, '').replace(',', '.');
        const num = parseFloat(normalized);
        return isNaN(num) ? null : num;
      }

      if (cleaned.includes('.') && !cleaned.includes(',')) {
        const parts = cleaned.split('.');
        if (parts.length > 1 && parts[parts.length - 1].length === 3) {
          const num = parseFloat(parts.join(''));
          return isNaN(num) ? null : num;
        }
      }

      if (cleaned.includes(',')) {
        const num = parseFloat(cleaned.replace(',', '.'));
        return isNaN(num) ? null : num;
      }

      const num = parseFloat(cleaned);
      return isNaN(num) ? null : num;
    }
    return null;
  };

  const rawPurpose = parsed.purpose ? String(parsed.purpose).toLowerCase() : null;
  let purpose: PropertyPurpose | null = null;
  if (rawPurpose && (rawPurpose.includes('loca') || rawPurpose.includes('alug'))) {
    purpose = 'Locação';
  } else if (rawPurpose && (rawPurpose.includes('vend') || rawPurpose.includes('comp'))) {
    purpose = 'Venda';
  } else if (parsed.purpose === 'Venda' || parsed.purpose === 'Locação') {
    purpose = parsed.purpose;
  }

  const ambiguousFields: string[] = Array.isArray(parsed.ambiguous_fields) ? parsed.ambiguous_fields : [];

  const result: ExtractedPropertyData = {
    purpose,
    type: parsed.type || null,
    neighborhood: parsed.neighborhood ? String(parsed.neighborhood).trim() : null,
    address: parsed.address ? String(parsed.address).trim() : null,
    number: parsed.number ? String(parsed.number).trim() : null,
    complement: parsed.complement ? String(parsed.complement).trim() : null,
    condominium_name: parsed.condominium_name ? String(parsed.condominium_name).trim() : null,
    is_development: Boolean(parsed.is_development),
    stage: (['Pré-lançamento', 'Lançamento', 'Em construção', 'Pronto para morar'].includes(parsed.stage)
      ? parsed.stage
      : null) as DevelopmentStage | null,
    delivery_date: parsed.delivery_date ? String(parsed.delivery_date).trim() : null,
    incorporation_registration: parsed.incorporation_registration
      ? String(parsed.incorporation_registration).trim()
      : null,
    price_from:
      parseNullableNumber(parsed.price_from) ||
      (Boolean(parsed.is_development) ? parseNullableNumber(parsed.price) : null),
    bedrooms: parseNullableNumber(parsed.bedrooms),
    bedrooms_options: Array.isArray(parsed.bedrooms_options)
      ? parsed.bedrooms_options.map((n: any) => parseInt(n, 10)).filter((n: number) => !isNaN(n))
      : null,
    suites: parseNullableNumber(parsed.suites),
    suites_options: Array.isArray(parsed.suites_options)
      ? parsed.suites_options.map((n: any) => parseInt(n, 10)).filter((n: number) => !isNaN(n))
      : null,
    bathrooms: parseNullableNumber(parsed.bathrooms),
    bathrooms_options: Array.isArray(parsed.bathrooms_options)
      ? parsed.bathrooms_options.map((n: any) => parseInt(n, 10)).filter((n: number) => !isNaN(n))
      : null,
    parking_spaces: parseNullableNumber(parsed.parking_spaces),
    parking_options: Array.isArray(parsed.parking_options)
      ? parsed.parking_options.map((n: any) => parseInt(n, 10)).filter((n: number) => !isNaN(n))
      : null,
    area_m2: parseNullableNumber(parsed.area_m2),
    area_range:
      parsed.area_range && (parsed.area_range.min || parsed.area_range.max)
        ? {
            min: parseNullableNumber(parsed.area_range.min) || 0,
            max: parseNullableNumber(parsed.area_range.max) || 0,
          }
        : null,
    is_approximate_area: Boolean(parsed.is_approximate_area),
    price: parseNullableNumber(parsed.price),
    is_approximate_price: Boolean(parsed.is_approximate_price),
    condo_fee: parseNullableNumber(parsed.condo_fee),
    condo_included: Boolean(parsed.condo_included),
    condo_not_applicable: Boolean(parsed.condo_not_applicable),
    iptu: parseNullableNumber(parsed.iptu),
    floor: parseNullableNumber(parsed.floor),
    position: parsed.position && parsed.position !== 'Não informado' ? (parsed.position as PropertyPosition) : null,
    furnished: parsed.furnished === true ? true : parsed.furnished === false ? false : null,
    condition: parsed.condition ? (parsed.condition as PropertyCondition) : null,
    building_features: [],
    apartment_features: Array.isArray(parsed.apartment_features) ? parsed.apartment_features : [],
    source_type: (parsed.source_type || 'Próprio') as SourceType,
    owner_name: parsed.owner_name ? String(parsed.owner_name).trim() : null,
    owner_phone: parsed.owner_phone ? String(parsed.owner_phone).trim() : null,
    partner_name: parsed.partner_name ? String(parsed.partner_name).trim() : null,
    partner_phone: parsed.partner_phone ? String(parsed.partner_phone).trim() : null,
    ambiguous_fields: ambiguousFields,
    notes:
      typeof parsed.notes === 'string' && parsed.notes.trim() && parsed.notes.trim().toLowerCase() !== 'null'
        ? parsed.notes.trim()
        : undefined,
  };

  // Normalização semântica rigorosa das comodidades extraídas pela IA
  const rawBuildingFeatures = Array.isArray(parsed.building_features) ? parsed.building_features : [];
  const normalizedAmenities = normalizeAmenityList(rawBuildingFeatures, {
    parking_spaces: result.parking_spaces,
    apartment_features: result.apartment_features,
  });
  result.building_features = normalizedAmenities.building_features;
  if ((result.parking_spaces === null || result.parking_spaces === 0) && normalizedAmenities.parking_spaces) {
    result.parking_spaces = normalizedAmenities.parking_spaces;
  }
  if (normalizedAmenities.apartment_features && normalizedAmenities.apartment_features.length > 0) {
    result.apartment_features = normalizedAmenities.apartment_features;
  }

  // Validação do núcleo obrigatório e campos desejáveis
  const validation = validatePropertyExtraction(result);
  result.missing_mandatory = validation.missing_mandatory;
  result.missing_desirable = validation.missing_desirable;

  const field_states: Record<string, FieldState> = {};
  const checkedKeys: (keyof ExtractedPropertyData)[] = [
    'purpose',
    'type',
    'neighborhood',
    'area_m2',
    'price',
    'bedrooms',
    'suites',
    'bathrooms',
    'parking_spaces',
    'condo_fee',
    'position',
    'condition',
    'furnished',
  ];

  for (const key of checkedKeys) {
    if (ambiguousFields.includes(key)) {
      field_states[key] = 'ambiguous';
    } else if (result[key] !== null && result[key] !== undefined && result[key] !== '') {
      field_states[key] = 'informed';
    } else {
      field_states[key] = 'missing';
    }
  }

  // Comodidades e Lazer: marcado como 'informed' se houver itens OU se o usuário disser que não possui lazer
  const textLower = text.toLowerCase();
  const hasNoAmenitiesMention = /(?:n[ãa]o (?:tem|possui|há)|sem)\s+(?:\w+\s+){0,4}(?:lazer|comodidades?|[áa]rea de lazer)/.test(textLower);
  if (result.building_features && result.building_features.length > 0) {
    field_states.building_features = 'informed';
  } else if (hasNoAmenitiesMention) {
    field_states.building_features = 'informed';
  }

  result.field_states = field_states;

  return result;
}
