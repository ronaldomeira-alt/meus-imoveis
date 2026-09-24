import type { Property } from '../types/property';
import type {
  MarketingEditorialSettings,
  RegenerationOption,
} from '../types/marketing';
import type { PreferredAIProvider } from './ai-provider';

import { getEditorialSettings } from './marketing-db';

interface GenerateCaptionOptions {
  property: Property;
  editorialSettings?: MarketingEditorialSettings;
  option?: RegenerationOption;
  refinement?: RegenerationOption;
  customInstruction?: string;
  previousCaption?: string;
  groqApiKey?: string;
  geminiApiKey?: string;
  preferredProvider?: PreferredAIProvider;
}

export const REGENERATION_OPTIONS: { id: RegenerationOption; label: string; desc: string }[] = [
  { id: 'default', label: 'Padrão Editorial (AIDA)', desc: 'Estrutura persuasiva e equilibrada' },
  { id: 'shorter', label: 'Mais Curta', desc: 'Direta ao ponto, sem rodeios' },
  { id: 'natural', label: 'Mais Natural', desc: 'Tom de conversa espontânea' },
  { id: 'consultative', label: 'Mais Consultiva', desc: 'Posicionamento estratégico de mercado' },
  { id: 'objective', label: 'Mais Objetiva', desc: 'Foco em métricas, dimensões e custos' },
  { id: 'investment', label: 'Foco em Investimento', desc: 'Atratividade e demanda para investidores' },
  { id: 'family', label: 'Foco em Família', desc: 'Praticidade, vizinhança e qualidade de vida' },
];

const REFINEMENT_INSTRUCTIONS: Record<RegenerationOption, string> = {
  default: 'Gere uma versão equilibrada, fluida e persuasiva.',
  shorter:
    'GERE UMA VERSÃO MAIS CURTA E DIRETA. Elimine enrolações, seja conciso, mantenha apenas o gancho mais forte, 2 ou 3 fatos essenciais e o CTA rápido.',
  natural:
    'GERE UMA VERSÃO MAIS NATURAL E ESPONTÂNEA. Escreva como se fosse um áudio transcrito ou uma conversa direta entre duas pessoas, com linguagem descontraída, próxima e zero afetação.',
  consultative:
    'GERE UMA VERSÃO MAIS CONSULTIVA. Posicione o corretor como um consultor imobiliário experiente e estratégico, que entende o mercado da região e orienta o cliente com autoridade serena.',
  objective:
    'GERE UMA VERSÃO MAIS OBJETIVA. Destaque prioritariamente as métricas e especificações concretas: m², distribuição dos cômodos, posição solar, custos e localização.',
  investment:
    'GERE UMA VERSÃO VOLTADA PARA INVESTIMENTO. Destaque atratividade de locação por temporada ou longo prazo, liquidez da região, demanda turística ou comercial. ATENÇÃO: NÃO invente números de rentabilidade ou promessas irreais.',
  family:
    'GERE UMA VERSÃO VOLTADA PARA MORADIA E FAMÍLIA. Destaque a praticidade do dia a dia, proximidade de escolas, padarias, farmácias, a tranquilidade da rua e os espaços de convivência do condomínio.',
};

/**
 * Constrói o prompt do sistema integrando as 3 camadas da Tríade de Inteligência
 */
function buildSystemPrompt(settings: MarketingEditorialSettings): string {
  return `Você é o redator e estrategista de marketing imobiliário do sistema "Meus Imóveis".
Sua missão é escrever legendas excepcionais e de alta conversão para o Instagram, com base estrita no imóvel fornecido e nas três diretrizes editoriais abaixo.

==================================================
CAMADA 1: ESTRUTURA E INTELIGÊNCIA EDITORIAL
==================================================
${settings.structural_skill}

==================================================
CAMADA 2: PERFIL E TOM DO CORRETOR
==================================================
${settings.realtor_profile_skill}

==================================================
CAMADA 3: CRIVO NEGATIVO (O QUE NUNCA FAZER)
==================================================
${settings.negative_rules_skill}

==================================================
DIRETRIZES DE SAÍDA:
==================================================
- Retorne EXCLUSIVAMENTE o texto final da legenda pronto para ser publicado no Instagram.
- Não inclua saudações, introduções ("Aqui está sua legenda:") nem notas explicativas no início ou no fim.
- Não coloque aspas em volta da legenda inteira.
- Use quebras de linha limpas para garantir leitura confortável em telas de smartphones.`;
}

/**
 * Constrói o contexto do imóvel unindo dados objetivos + Observações
 */
function buildPropertyContext(property: Property): string {
  const parts: string[] = [];

  parts.push(`--- DADOS OBJETIVOS DO IMÓVEL ---`);
  parts.push(`Finalidade: ${property.purpose || 'Venda'}`);
  parts.push(`Tipo: ${property.type}`);
  parts.push(`Bairro: ${property.neighborhood}`);
  if (property.condominium_name) parts.push(`Condomínio/Edifício: ${property.condominium_name}`);
  parts.push(`Área privativa: ${property.area_m2} m²`);
  parts.push(`Quartos: ${property.bedrooms} (${property.suites} suíte(s))`);
  parts.push(`Banheiros: ${property.bathrooms}`);
  parts.push(`Vagas de garagem: ${property.parking_spaces_type === 'Rotativas' ? 'rotativas' : property.parking_spaces}`);
  if (property.position && property.position !== 'Não informado') parts.push(`Posição solar: ${property.position}`);
  if (property.price > 0) {
    parts.push(`Valor: R$ ${property.price.toLocaleString('pt-BR')}`);
  }
  if (property.condo_fee && property.condo_fee > 0) {
    parts.push(`Taxa de condomínio: R$ ${property.condo_fee.toLocaleString('pt-BR')}/mês`);
  }
  if (property.building_features && property.building_features.length > 0) {
    parts.push(`Lazer e estrutura do prédio: ${property.building_features.join(', ')}`);
  }
  if (property.apartment_features && property.apartment_features.length > 0) {
    parts.push(`Diferenciais da unidade: ${property.apartment_features.join(', ')}`);
  }

  // ── O CORAÇÃO DO CONTEÚDO SUBJETIVO: OBSERVAÇÕES ──
  parts.push(`\n--- OBSERVAÇÕES & PERCEPÇÕES DO CORRETOR (FONTE PRINCIPAL DE ARGUMENTOS) ---`);
  if (property.notes && property.notes.trim()) {
    parts.push(property.notes.trim());
  } else {
    parts.push('Nenhuma observação adicional foi fornecida. Apoie-se nos dados objetivos e nos pontos fortes do bairro.');
  }

  return parts.join('\n');
}

/**
 * Chamada à API da Groq (Llama 3.3 70B Versatile)
 */
async function callGroqCaption(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const modelsToTry = ['openai/gpt-oss-120b', 'openai/gpt-oss-20b', 'qwen/qwen3.8-27b'];
  let lastErr: any = null;

  for (const model of modelsToTry) {
    try {
      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey.trim()}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.72,
          max_tokens: 1200,
        }),
      });

      const data = await response.json();
      if (response.ok && data.choices?.[0]?.message?.content) {
        return data.choices[0].message.content.trim();
      }
      lastErr = new Error(data.error?.message || `Erro Groq HTTP ${response.status}`);
    } catch (err) {
      lastErr = err;
    }
  }

  throw lastErr || new Error('Falha ao gerar legenda com modelos Groq disponíveis.');
}

/**
 * Chamada à API do Google Gemini
 */
async function callGeminiCaption(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey.trim()}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n=== TAREFA ===\n${userPrompt}` }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1200,
      },
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Erro Gemini HTTP ${response.status}`);
  }

  return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || '';
}

/**
 * Função principal para gerar ou regenerar a legenda
 */
export async function generatePropertyCaption(
  options: GenerateCaptionOptions
): Promise<{ caption: string; providerUsed: 'groq' | 'gemini' }> {
  const {
    property,
    editorialSettings: providedSettings,
    option,
    refinement = option || 'default',
    customInstruction,
    previousCaption,
    groqApiKey = (import.meta.env.VITE_GROQ_API_KEY as string) || localStorage.getItem('meus_imoveis_groq_key') || '',
    geminiApiKey = (import.meta.env.VITE_GEMINI_API_KEY as string) || localStorage.getItem('meus_imoveis_gemini_key') || '',
    preferredProvider = 'auto',
  } = options;

  const editorialSettings = providedSettings || (await getEditorialSettings());
  const systemPrompt = buildSystemPrompt(editorialSettings);
  const propertyContext = buildPropertyContext(property);

  const refinementPrompt = REFINEMENT_INSTRUCTIONS[refinement] || REFINEMENT_INSTRUCTIONS.default;

  const userPromptLines: string[] = [
    `Aqui estão as informações do imóvel para a criação do post:`,
    propertyContext,
    `\n--- INSTRUÇÃO DESTE PEDIDO ---`,
    `Diretriz de refinamento: ${refinementPrompt}`,
  ];

  if (previousCaption) {
    userPromptLines.push(`\n--- LEGENDA ANTERIOR (COMO BASE PARA AJUSTE OU REGENERAÇÃO) ---`);
    userPromptLines.push(previousCaption);
  }

  if (customInstruction && customInstruction.trim()) {
    userPromptLines.push(`\n--- INSTRUÇÃO ADICIONAL ESPECÍFICA DO CORRETOR ---`);
    userPromptLines.push(customInstruction.trim());
  }

  userPromptLines.push(`\nEscreva a legenda agora respeitando rigorosamente as 3 camadas editoriais.`);

  const userPrompt = userPromptLines.join('\n');

  const hasGroq = Boolean(groqApiKey && groqApiKey.trim().length > 10);
  const hasGemini = Boolean(geminiApiKey && geminiApiKey.trim().length > 10);

  let providers: ('groq' | 'gemini')[] = [];
  if (preferredProvider === 'gemini') {
    if (hasGemini) providers.push('gemini');
    if (hasGroq) providers.push('groq');
  } else {
    if (hasGroq) providers.push('groq');
    if (hasGemini) providers.push('gemini');
  }

  if (providers.length === 0) {
    throw new Error('Nenhuma chave de IA configurada. Configure sua chave da Groq ou Google Gemini em Configurações.');
  }

  let lastError: any = null;
  for (const provider of providers) {
    try {
      if (provider === 'groq') {
        const caption = await callGroqCaption(groqApiKey, systemPrompt, userPrompt);
        if (caption) return { caption, providerUsed: 'groq' };
      } else if (provider === 'gemini') {
        const caption = await callGeminiCaption(geminiApiKey, systemPrompt, userPrompt);
        if (caption) return { caption, providerUsed: 'gemini' };
      }
    } catch (err) {
      console.warn(`Tentativa de gerar legenda com ${provider} falhou:`, err);
      lastError = err;
    }
  }

  throw lastError || new Error('Não foi possível gerar a legenda com os provedores disponíveis.');
}

/**
 * Atalho para retornar diretamente a string da legenda
 */
export async function generateEditorialCaption(
  options: GenerateCaptionOptions
): Promise<string> {
  const result = await generatePropertyCaption(options);
  return result.caption;
}
