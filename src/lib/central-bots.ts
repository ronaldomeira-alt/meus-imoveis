import { supabase } from './supabase';

export const CENTRAL_BOTS_ENABLED =
  import.meta.env.VITE_CENTRAL_BOTS_ENABLED === 'true';
export type BotAvatarName =
  'gestor' | 'captador' | 'sentinela' | 'jade' | 'coral' | 'silver' | 'marketing';
export interface AgentRun {
  id: string;
  bot_id: string;
  status: string;
  started_at: string;
  finished_at?: string;
  trigger_type: string;
  error?: string;
  result?: Record<string, unknown>;
}
export interface AgentBot {
  id: string;
  slug: string;
  name: string;
  mission: string;
  kind: string;
  avatar: BotAvatarName;
  active: boolean;
  work_mode: string;
  autonomy: string;
  tools: string[];
  notifications: boolean;
  last_run: AgentRun | null;
  schedule: {
    enabled: boolean;
    next_run_at: string;
    last_run_at: string | null;
    interval_minutes: number;
  } | null;
}
export interface AgentMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  sources: { tool: string; observed_at: string; data: unknown }[];
}
export interface AgentApproval {
  id: string;
  bot_id: string;
  reason: string;
  action: string;
  status: string;
  created_at: string;
  decided_at?: string;
  result?: unknown;
  context: Record<string, unknown>;
}
export interface AgentIncident {
  id: string;
  bot_id: string;
  component: string;
  expected: string;
  observed: string;
  impact: string;
  confidence: number;
  last_seen_at: string;
  dossier: Record<string, unknown>;
}
export interface AgentEvent {
  id: string;
  type: string;
  tool?: string;
  created_at: string;
  payload: Record<string, unknown>;
}
export interface CentralData {
  previews?: Record<string, Pick<AgentMessage, 'content' | 'role' | 'created_at'>>;
  bots: AgentBot[];
  approvals: AgentApproval[];
  incidents: AgentIncident[];
  tools: { name: string; description: string }[];
  provider_configured: boolean;
  settings: { enabled: boolean; last_tick_at: string | null };
}
export interface ConversationData {
  conversation_id: string;
  messages: AgentMessage[];
  runs: AgentRun[];
  events: AgentEvent[];
}

export async function centralRequest<T>(
  body: Record<string, unknown>,
  signal?: AbortSignal,
  onText?: (text: string) => void,
): Promise<T> {
  if (!supabase) throw new Error('Conexão indisponível.');
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session)
    throw new Error('Sua sessão expirou. Entre novamente.');
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(abort, 120000);
  try {
    const response = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/central-bots`,
      {
        method: 'POST',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${data.session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({...body,...(onText && body.action==='chat'?{stream:true}:{})}),
      },
    );
    if(response.ok && onText && response.headers.get('content-type')?.includes('application/x-ndjson')) {
      const reader=response.body?.getReader();if(!reader)throw new Error('Resposta interrompida.');
      const decoder=new TextDecoder();let pending='',result:T|undefined;
      const consume=(line:string)=>{
        if(!line.trim())return;
        const event=JSON.parse(line);
        if(event.type==='error')throw new Error(event.error||'A consulta foi interrompida.');
        if(event.type==='text' && typeof event.text==='string')onText(event.text);
        if(event.type==='done')result=event as T;
      };
      try {
        for(;;){const chunk=await reader.read();if(chunk.done)break;pending+=decoder.decode(chunk.value,{stream:true});let boundary;while((boundary=pending.indexOf('\n'))>=0){consume(pending.slice(0,boundary));pending=pending.slice(boundary+1);}if(pending.length>200000)throw new Error('Resposta inválida.');}
        pending+=decoder.decode();consume(pending);
        if(!result)throw new Error('A resposta foi interrompida. Tente novamente.');
        return result;
      }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        result.error || 'A Central não respondeu. Tente novamente.',
      );
    return result;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}

export function audioBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('Não foi possível ler o áudio.'));
    reader.readAsDataURL(blob);
  });
}
