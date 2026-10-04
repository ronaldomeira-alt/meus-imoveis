import { extractPropertyWithGemini, type ExtractedPropertyData } from './gemini';
import { normalizeExtractedProperty } from './property-ai-result';
import { requestSystemAI, audioBase64, type SystemAIProvider } from './system-ai';
export type PreferredAIProvider = 'auto' | SystemAIProvider;
export interface MultiProviderAudioOptions { audioBlob: Blob; }
export interface MultiProviderExtractionOptions { text: string; }
export async function transcribeAudioMultiProvider({ audioBlob }: MultiProviderAudioOptions): Promise<{text:string;providerUsed:SystemAIProvider}> {
  return requestSystemAI({action:'transcribe',audio:await audioBase64(audioBlob),mime:(audioBlob.type||'audio/webm').split(';')[0].replace('audio/x-m4a','audio/mp4')});
}
export async function extractPropertyMultiProvider({text}: MultiProviderExtractionOptions): Promise<{data:ExtractedPropertyData;providerUsed:SystemAIProvider|'local'}> {
  try {
    const result=await requestSystemAI<{data:Record<string,unknown>;providerUsed:SystemAIProvider}>({action:'extract',text});
    return {data:normalizeExtractedProperty(result.data,text),providerUsed:result.providerUsed};
  } catch {
    // Offline deterministic parsing makes no AI or network calls.
    return {data:await extractPropertyWithGemini(text),providerUsed:'local'};
  }
}
