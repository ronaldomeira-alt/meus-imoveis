import type { ExtractedPropertyData } from './gemini';
import { validatePropertyExtraction } from './gemini';

export interface InstagramPost {
  url: string;
  caption: string;
  username: string;
  ownerName: string;
  isOwnPost: boolean;
  images: string[];
}

const parseMoney = (value: string): number => {
  const normalized = value.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  return Number(normalized);
};

const moneyAfter = (caption: string, label: RegExp): number | null => {
  const match = caption.match(label);
  const value = match?.[1] ? parseMoney(match[1]) : NaN;
  return Number.isFinite(value) && value > 0 ? value : null;
};

const addUnique = (values: string[], item: string): string[] =>
  values.some((value) => value.toLocaleLowerCase('pt-BR') === item.toLocaleLowerCase('pt-BR')) ? values : [...values, item];

/** Completa a extração da IA com sinais explícitos do anúncio, sem inventar campos ausentes. */
export function prepareInstagramProperty(post: InstagramPost, extracted: ExtractedPropertyData): ExtractedPropertyData {
  const caption = post.caption.normalize('NFC');
  const data: ExtractedPropertyData = { ...extracted };
  const neighborhoodNames: Record<string, string> = {
    'cabo branco': 'Cabo Branco',
    'jardim oceania': 'Jardim Oceania',
    'ponta de campina': 'Ponta de Campina',
  };
  if (data.neighborhood) {
    data.neighborhood = neighborhoodNames[data.neighborhood.toLocaleLowerCase('pt-BR')] || data.neighborhood;
  }
  const salePrice = moneyAfter(caption, /(?:preço(?: de venda)?|valor(?: de venda)?|venda|💰)\s*[:-]?\s*(?:R\$\s*)?(\d{2,3}(?:\.\d{3})+(?:,\d{2})?|\d{5,8})/i);
  const visiblePrices = [...caption.matchAll(/R\$\s*(\d{1,3}(?:\.\d{3})+(?:,\d{2})?|\d{2,8}(?:,\d{2})?)/gi)]
    .map((match) => parseMoney(match[1]));
  const inferredSalePrice = Math.max(0, ...visiblePrices.filter((value) => value >= 100_000));
  const condoFee = moneyAfter(caption, /condom[ií]nio\s*[:-]?\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d{2,5})/i);
  const iptu = moneyAfter(caption, /\bIPTU\s*[:-]?\s*(?:R\$\s*)?(\d{1,3}(?:\.\d{3})*(?:,\d{2})?|\d{2,5})/i);
  if ((salePrice && salePrice >= 50_000) || inferredSalePrice) {
    data.price = salePrice && salePrice >= 50_000 ? salePrice : inferredSalePrice;
    data.purpose = 'Venda';
  }
  if (condoFee) data.condo_fee = condoFee;
  if (iptu) data.iptu = iptu;
  const wcCount = caption.match(/\b(\d+)\s*wc(?:s)?\b/i);
  if (data.bathrooms == null && wcCount) data.bathrooms = Number(wcCount[1]);
  if (/porteira\s+fechada/i.test(caption)) data.furnished = true;

  const amenities: [RegExp, string][] = [
    [/\b(piscina|pool)\b/i, 'Piscina'],
    [/\bacademia\b/i, 'Academia'],
    [/\b(brinquedoteca|espaço kids)\b/i, 'Brinquedoteca'],
    [/\bmini\s?mercado\b/i, 'Mini mercado'],
    [/\b(cinema|cine)\b/i, 'Cinema'],
    [/\blavanderia\b/i, 'Lavanderia'],
    [/\brooftop\b/i, 'Rooftop'],
    [/\bsal[aã]o de festas\b/i, 'Salão de festas'],
    [/\bportaria\s*24\s*h(?:r?s?|oras)?\b/i, 'Portaria 24h'],
  ];
  data.building_features = amenities.reduce(
    (items, [pattern, name]) => pattern.test(caption) ? addUnique(items, name) : items,
    [...(data.building_features || [])],
  );
  data.apartment_features = [...(data.apartment_features || [])];
  if (/\bvaranda\b/i.test(caption) && !/\bvaranda\s+gourmet\b/i.test(caption)) {
    data.apartment_features = data.apartment_features.filter((item) => item !== 'Varanda gourmet');
    data.apartment_features = addUnique(data.apartment_features, 'Varanda');
  }

  data.source_type = post.isOwnPost ? 'Próprio' : 'Parceiro';
  data.partner_name = post.isOwnPost ? null : (post.ownerName || post.username || null);
  data.instagram_source_url = post.url;
  data.social_publications = post.isOwnPost
    ? { ...(data.social_publications || {}), instagram: { status: 'published', url: post.url } }
    : { ...(data.social_publications || {}), instagram: { status: 'not_published' } };

  const opening = [
    data.type && `${data.type}${data.purpose === 'Venda' ? ' à venda' : data.purpose === 'Locação' ? ' para locação' : ''}`,
    data.neighborhood && `em ${data.neighborhood}`,
  ].filter(Boolean).join(' ');
  const description = [
    opening,
    data.area_m2 && `com ${data.area_m2} m²`,
    data.bedrooms != null && `${data.bedrooms} quarto${data.bedrooms === 1 ? '' : 's'}`,
    data.suites != null && data.suites > 0 && `${data.suites} suíte${data.suites === 1 ? '' : 's'}`,
    data.parking_spaces != null && data.parking_spaces > 0 && `${data.parking_spaces} vaga${data.parking_spaces === 1 ? '' : 's'}`,
  ].filter(Boolean).join(', ');
  const details = [
    data.furnished && 'Porteira fechada.',
    data.building_features.length > 0 && `Estrutura do condomínio: ${data.building_features.join(', ')}.`,
    data.apartment_features.length > 0 && `Características: ${data.apartment_features.join(', ')}.`,
  ].filter(Boolean).join(' ');
  const observations = [
    /\b(aceita financiamento|financi[aá]vel)\b/i.test(caption) && 'Aceita financiamento.',
    /\bpronto para morar\b/i.test(caption) && 'Pronto para morar.',
    /\b(vista (?:para o )?mar|vista mar)\b/i.test(caption) && 'Vista para o mar.',
  ].filter(Boolean).join(' ');
  const aiNotes = (extracted.notes || '').trim();
  const distinctAiNotes = aiNotes && aiNotes.length <= 280 && aiNotes !== caption.trim() && !/https?:\/\/|@\w+|#\w+/.test(aiNotes)
    ? aiNotes : '';
  data.notes = [description && `${description}.`, details, observations, distinctAiNotes].filter(Boolean).join(' ');
  const validation = validatePropertyExtraction(data);
  data.missing_mandatory = validation.missing_mandatory;
  data.missing_desirable = validation.missing_desirable;
  return data;
}
