import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type SystemAIProvider = 'groq' | 'gemini' | 'openai' | 'deepinfra';
export interface SystemAIConfig {
  provider: SystemAIProvider;
  model: string;
  transcription_model: string;
  enabled: boolean;
  configured: boolean;
  can_manage: boolean;
  catalog: Record<SystemAIProvider, { models: string[]; audioModels: string[] }>;
}
export async function requestSystemAI<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error('Faça login para usar a IA do sistema.');
  const { data, error } = await supabase.functions.invoke('system-ai', {
    body: { request_id: crypto.randomUUID(), ...body },
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const response = await error.context.json().catch(() => ({}));
      throw new Error(response.error || 'Não foi possível acessar a IA do sistema.');
    }
    throw new Error('Não foi possível conectar à IA do sistema.');
  }
  return data as T;
}
export async function audioBase64(blob: Blob): Promise<string> {
  if (blob.size < 100 || blob.size > 2500000) throw new Error('O áudio deve ter até 2,5 MB.');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
  return btoa(binary);
}
