import { transcribeAudioWithGroq, extractPropertyWithGroq } from './groq';
import { transcribeAudioWithGemini, extractPropertyWithGemini, ExtractedPropertyData } from './gemini';

export type PreferredAIProvider = 'auto' | 'groq' | 'gemini';

export interface MultiProviderAudioOptions {
  audioBlob: Blob;
  groqApiKey?: string;
  geminiApiKey?: string;
  preferredProvider?: PreferredAIProvider;
  spokenTextFallback?: string;
}

export interface MultiProviderExtractionOptions {
  text: string;
  groqApiKey?: string;
  geminiApiKey?: string;
  preferredProvider?: PreferredAIProvider;
}

/**
 * Orquestrador de transcrição de áudio:
 * 1. Prioriza Groq Whisper se a chave estiver configurada (velocidade ~300ms e altíssima precisão).
 * 2. Em caso de ausência ou falha, tenta Google Gemini multimodal.
 * 3. Em caso de ausência ou falha de ambos, adota o Web Speech API nativo capturado em tempo real.
 */
export const transcribeAudioMultiProvider = async (
  options: MultiProviderAudioOptions
): Promise<{ text: string; providerUsed: 'groq' | 'gemini' | 'native' }> => {
  const {
    audioBlob,
    groqApiKey,
    geminiApiKey,
    preferredProvider = 'auto',
    spokenTextFallback = '',
  } = options;

  const hasGroq = Boolean(groqApiKey && groqApiKey.trim().length > 10);
  const hasGemini = Boolean(geminiApiKey && geminiApiKey.trim().length > 10);

  // Ordem de provedores
  let providersToTry: ('groq' | 'gemini')[] = [];
  if (preferredProvider === 'gemini') {
    if (hasGemini) providersToTry.push('gemini');
    if (hasGroq) providersToTry.push('groq');
  } else {
    // 'auto' ou 'groq': prioriza Groq pela velocidade excepcional
    if (hasGroq) providersToTry.push('groq');
    if (hasGemini) providersToTry.push('gemini');
  }

  for (const provider of providersToTry) {
    try {
      if (provider === 'groq' && groqApiKey) {
        const text = await transcribeAudioWithGroq(audioBlob, groqApiKey);
        if (text) {
          return { text, providerUsed: 'groq' };
        }
      } else if (provider === 'gemini' && geminiApiKey) {
        const text = await transcribeAudioWithGemini(audioBlob, geminiApiKey);
        if (text) {
          return { text, providerUsed: 'gemini' };
        }
      }
    } catch (err) {
      console.warn(`Tentativa de transcrição com ${provider} falhou, tentando fallback:`, err);
    }
  }

  // Fallback para fala capturada nativamente pelo navegador (Web Speech API)
  if (spokenTextFallback.trim()) {
    return { text: spokenTextFallback.trim(), providerUsed: 'native' };
  }

  throw new Error('Nenhuma fala foi identificada na gravação. Tente falar mais perto do microfone ou digite o texto.');
};

/**
 * Orquestrador de extração estruturada de imóvel:
 * 1. Prioriza Groq Llama 3.3 se a chave estiver configurada.
 * 2. Em caso de ausência ou falha, tenta Google Gemini.
 * 3. Em caso de ausência ou falha de ambos, adota o parser inteligente local.
 */
export const extractPropertyMultiProvider = async (
  options: MultiProviderExtractionOptions
): Promise<{ data: ExtractedPropertyData; providerUsed: 'groq' | 'gemini' | 'local' }> => {
  const { text, groqApiKey, geminiApiKey, preferredProvider = 'auto' } = options;

  const hasGroq = Boolean(groqApiKey && groqApiKey.trim().length > 10);
  const hasGemini = Boolean(geminiApiKey && geminiApiKey.trim().length > 10);

  let providersToTry: ('groq' | 'gemini')[] = [];
  if (preferredProvider === 'gemini') {
    if (hasGemini) providersToTry.push('gemini');
    if (hasGroq) providersToTry.push('groq');
  } else {
    if (hasGroq) providersToTry.push('groq');
    if (hasGemini) providersToTry.push('gemini');
  }

  for (const provider of providersToTry) {
    try {
      if (provider === 'groq' && groqApiKey) {
        const data = await extractPropertyWithGroq(text, groqApiKey);
        return { data, providerUsed: 'groq' };
      } else if (provider === 'gemini' && geminiApiKey) {
        const data = await extractPropertyWithGemini(text, geminiApiKey);
        return { data, providerUsed: 'gemini' };
      }
    } catch (err) {
      console.warn(`Tentativa de extração com ${provider} falhou, tentando fallback:`, err);
    }
  }

  // Fallback inteligente local baseado em regras contextuais
  const localData = await extractPropertyWithGemini(text);
  return { data: localData, providerUsed: 'local' };
};
