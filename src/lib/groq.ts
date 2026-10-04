import { requestSystemAI, audioBase64 } from './system-ai';
import { normalizeExtractedProperty } from './property-ai-result';
export async function testGroqConnection() {
  try { const result=await requestSystemAI<{message:string}>({action:'test'}); return {success:true,message:result.message}; }
  catch(error) { return {success:false,message:error instanceof Error?error.message:'IA indisponível.'}; }
}
export async function transcribeAudioWithGroq(audioBlob:Blob) {
  const result=await requestSystemAI<{text:string}>({action:'transcribe',audio:await audioBase64(audioBlob),mime:(audioBlob.type||'audio/webm').split(';')[0]});
  return result.text;
}
export async function extractPropertyWithGroq(text:string) {
  const result=await requestSystemAI<{data:Record<string,unknown>}>({action:'extract',text});
  return normalizeExtractedProperty(result.data,text);
}
