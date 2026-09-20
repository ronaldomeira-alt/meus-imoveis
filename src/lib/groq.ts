import type {
  PropertyType,
  PropertyPosition,
  PropertyCondition,
  PropertyPurpose,
  FieldState,
  SourceType,
} from '../types/property';
import { type ExtractedPropertyData, validatePropertyExtraction } from './gemini';

export const GROQ_MODELS = {
  TRANSCRIPTION: 'whisper-large-v3-turbo',
  EXTRACTION_PRIMARY: 'openai/gpt-oss-120b',
  EXTRACTION_FAST: 'openai/gpt-oss-20b',
  EXTRACTION_MINI: 'groq/compound-mini',
};

/**
 * Testa se uma chave da Groq API é válida e acessível.
 */
export const testGroqConnection = async (
  apiKey: string
): Promise<{ success: boolean; modelsCount?: number; message?: string }> => {
  if (!apiKey || apiKey.trim().length < 10) {
    return { success: false, message: 'Chave de API inválida ou não informada.' };
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/models', {
      headers: {
        Authorization: `Bearer ${apiKey.trim()}`,
      },
    });

    const data = await response.json();

    if (response.ok && data.data) {
      return {
        success: true,
        modelsCount: data.data.length,
        message: `Conexão bem-sucedida! ${data.data.length} modelos disponíveis na Groq.`,
      };
    }

    return {
      success: false,
      message: data.error?.message || `Erro de conexão HTTP ${response.status}`,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Falha de rede ao conectar à API da Groq.',
    };
  }
};

/**
 * Transcreve áudio com extrema velocidade (~300ms) usando o Groq Whisper Large v3 Turbo,
 * aplicando prompt de vocabulário imobiliário especializado para máxima fidelidade.
 */
export const transcribeAudioWithGroq = async (
  audioBlob: Blob,
  apiKey: string,
  model: string = GROQ_MODELS.TRANSCRIPTION
): Promise<string> => {
  if (!apiKey || apiKey.trim().length < 10) {
    throw new Error('Chave de API da Groq não configurada.');
  }

  // Determina extensão apropriada para o container de áudio
  let ext = 'webm';
  const typeLower = (audioBlob.type || '').toLowerCase();
  if (typeLower.includes('mp4') || typeLower.includes('m4a')) ext = 'mp4';
  else if (typeLower.includes('ogg')) ext = 'ogg';
  else if (typeLower.includes('wav')) ext = 'wav';

  const audioFile = new File([audioBlob], `audio_capture.${ext}`, {
    type: audioBlob.type || 'audio/webm',
  });

  const formData = new FormData();
  formData.append('file', audioFile);
  formData.append('model', model);
  formData.append('language', 'pt');
  formData.append('response_format', 'json');
  formData.append('temperature', '0');
  // Prompt de vocabulário para Whisper: garante precisão para bairros, números, termos imobiliários e valores
  formData.append(
    'prompt',
    'Imóveis, apartamentos, casas, flats, studios, coberturas, terrenos. Bairros de João Pessoa e Paraíba: Bessa, Manaíra, Cabo Branco, Tambaú, Intermares, Altiplano, Jardim Oceania, Aeroclube, Miramar, Bancários, Brisamar, Portal do Sol. Termos: m², metros quadrados, suítes, quartos, banheiros, vagas de garagem, condomínio incluso, IPTU, aluguel, locação, venda, mil, milhões, R$, nascente, poente, vista mar, varanda gourmet, móveis projetados.'
  );

  const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error?.message || `Falha na transcrição Groq (HTTP ${response.status})`
    );
  }

  const data = await response.json();
  const text = (data.text || '').trim();

  if (!text) {
    throw new Error('Nenhuma fala audível identificada pelo Whisper.');
  }

  return text;
};

/**
 * Extrai dados imobiliários estruturados a partir do texto usando Llama 3.3 70B na Groq,
 * aplicando regras estritas de zero-alucinação e validação de dados obrigatórios.
 */
export const extractPropertyWithGroq = async (
  text: string,
  apiKey: string,
  model: string = GROQ_MODELS.EXTRACTION_PRIMARY
): Promise<ExtractedPropertyData> => {
  if (!apiKey || apiKey.trim().length < 10) {
    throw new Error('Chave de API da Groq não configurada.');
  }

  const systemPrompt = `Você é um motor de inteligência artificial de alta precisão para extração de dados imobiliários no Brasil (especialmente Paraíba: Bessa, Manaíra, Cabo Branco, Tambaú, Intermares, Altiplano, Jardim Oceania, etc.).

DIRETRIZES FUNDAMENTAIS DE CONFIABILIDADE (REGRA ZERO ALUCINAÇÃO):
1. NUNCA INVENTE OU ADIVINHE VALORES. Se uma informação não foi explicitamente declarada no texto, retorne null.
2. NÃO ASSUMA DEFAULTS: não presuma 2 quartos, não presuma Bessa, não presuma R$ 450.000, não presuma taxa de condomínio de 450.
3. PREÇO E FINALIDADE:
   - Identifique a finalidade: "Venda" ou "Locação". Se o usuário citar aluguel/locar/locação, defina purpose = "Locação". Se citar venda/compra/comprar, defina purpose = "Venda". Se não for possível determinar, defina null.
   - Para "Locação", price é o valor mensal do aluguel. Para "Venda", price é o valor de venda.
   - Se o valor for aproximado ("por volta de 400 mil", "cerca de 500k"), marque is_approximate_price = true e extraia o número em price.
   - Se o preço não for mencionado, retorne price = null.
4. CONDOMÍNIO:
   - Se disser "com condomínio incluso" ou "já com condomínio", defina condo_included = true e condo_fee = null.
   - Se disser "condomínio de 450", defina condo_fee = 450 e condo_included = false.
   - Se não mencionar nada sobre condomínio, defina condo_fee = null e condo_included = false.
5. ÁREA:
   - Se disser área/metragem aproximada ("em torno de 60m²"), defina is_approximate_area = true e area_m2 = 60. Se não informado, retorne area_m2 = null.
6. CARACTERÍSTICAS (quartos, suítes, banheiros, vagas):
   - Extraia APENAS números explicitamente informados. Se não citado, retorne null.
7. AMBIGUIDADES:
   - Se houver termos conflitantes ou ininteligíveis, adicione o nome do campo na lista "ambiguous_fields".

Responda EXCLUSIVAMENTE em formato JSON estrito, sem formatação markdown ao redor:
{
  "purpose": "Venda" | "Locação" | null,
  "type": "Apartamento" | "Casa" | "Cobertura" | "Flat" | "Studio" | "Terreno" | "Comercial" | "Outro" | null,
  "neighborhood": string | null,
  "address": string | null,
  "number": string | null,
  "complement": string | null,
  "condominium_name": string | null,
  "bedrooms": number | null,
  "suites": number | null,
  "bathrooms": number | null,
  "parking_spaces": number | null,
  "area_m2": number | null,
  "is_approximate_area": boolean,
  "price": number | null,
  "is_approximate_price": boolean,
  "condo_fee": number | null,
  "condo_included": boolean,
  "iptu": number | null,
  "floor": number | null,
  "position": "Nascente" | "Poente" | "Norte" | "Sul" | null,
  "furnished": boolean | null,
  "condition": "Novo" | "Usado" | "Em construção" | "Reformado" | null,
  "building_features": string[],
  "apartment_features": string[],
  "source_type": "Próprio" | "Parceiro",
  "owner_name": string | null,
  "owner_phone": string | null,
  "partner_name": string | null,
  "partner_phone": string | null,
  "ambiguous_fields": string[]
}`;

  const modelsToTry = [
    model,
    'openai/gpt-oss-120b',
    'openai/gpt-oss-20b',
    'groq/compound-mini',
    'llama-3.3-70b-versatile',
  ].filter((m, idx, arr) => arr.indexOf(m) === idx);

  let lastError: Error | null = null;
  let rawContent: string | null = null;

  for (const m of modelsToTry) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey.trim()}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: m,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Texto narrado/descrito sobre o imóvel:\n\n${text}` },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.1,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error?.message || `Erro na extração Groq com ${m} (HTTP ${response.status})`);
      }

      const data = await response.json();
      rawContent = data.choices?.[0]?.message?.content;
      if (rawContent) break;
    } catch (err: any) {
      lastError = err;
      console.warn(`Tentativa com modelo Groq ${m} falhou:`, err.message);
    }
  }

  if (!rawContent) {
    throw lastError || new Error('Resposta vazia da Groq AI.');
  }

  const parsed = JSON.parse(rawContent);

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
    bedrooms: parseNullableNumber(parsed.bedrooms),
    suites: parseNullableNumber(parsed.suites),
    bathrooms: parseNullableNumber(parsed.bathrooms),
    parking_spaces: parseNullableNumber(parsed.parking_spaces),
    area_m2: parseNullableNumber(parsed.area_m2),
    is_approximate_area: Boolean(parsed.is_approximate_area),
    price: parseNullableNumber(parsed.price),
    is_approximate_price: Boolean(parsed.is_approximate_price),
    condo_fee: parseNullableNumber(parsed.condo_fee),
    condo_included: Boolean(parsed.condo_included),
    iptu: parseNullableNumber(parsed.iptu),
    floor: parseNullableNumber(parsed.floor),
    position: parsed.position && parsed.position !== 'Não informado' ? (parsed.position as PropertyPosition) : null,
    furnished: parsed.furnished === true ? true : parsed.furnished === false ? false : null,
    condition: parsed.condition ? (parsed.condition as PropertyCondition) : null,
    building_features: Array.isArray(parsed.building_features) ? parsed.building_features : [],
    apartment_features: Array.isArray(parsed.apartment_features) ? parsed.apartment_features : [],
    source_type: (parsed.source_type || 'Próprio') as SourceType,
    owner_name: parsed.owner_name ? String(parsed.owner_name).trim() : null,
    owner_phone: parsed.owner_phone ? String(parsed.owner_phone).trim() : null,
    partner_name: parsed.partner_name ? String(parsed.partner_name).trim() : null,
    partner_phone: parsed.partner_phone ? String(parsed.partner_phone).trim() : null,
    ambiguous_fields: ambiguousFields,
    notes: text,
  };

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
  result.field_states = field_states;

  return result;
};
