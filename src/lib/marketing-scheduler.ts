import { supabase } from './supabase';
import { saveMarketingPost } from './marketing-db';
import type { MarketingPost } from '../types/marketing';

/**
 * Publica um post imediatamente no Instagram passando EXCLUSIVAMENTE pelo mesmo
 * motor server-side unificado (Edge Function 'publish-instagram-post'),
 * garantindo idempotência, trava 'publishing' e auditoria de erros.
 */
export async function publishMarketingPostNow(post: MarketingPost): Promise<{
  success: boolean;
  mediaId?: string;
  error?: string;
}> {
  if (!supabase) {
    return { success: false, error: 'Supabase não inicializado.' };
  }

  try {
    // Garante que o post exista no banco antes de publicar
    let targetPostId = post.id;
    if (!targetPostId) {
      const saved = await saveMarketingPost(post);
      targetPostId = saved.id;
    }

    // Invoca o motor de publicação oficial na Supabase Edge Function
    const { data, error } = await supabase.functions.invoke('publish-instagram-post', {
      body: {
        action: 'publish_now',
        postId: targetPostId,
      },
    });

    if (error) {
      console.error('Erro na chamada da Edge Function publish-instagram-post:', error);
      return { success: false, error: error.message || 'Erro ao comunicar com a Edge Function' };
    }

    if (!data || !data.success) {
      return { success: false, error: data?.error || 'Falha na publicação retornada pela Edge Function' };
    }

    // Notifica componentes na interface para recarregar o grid/feed
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('marketing-posts-updated'));
    }

    return {
      success: true,
      mediaId: data.externalMediaId,
    };
  } catch (err: any) {
    console.error('Exceção ao publicar post:', err);
    return { success: false, error: err.message || 'Erro inesperado na publicação.' };
  }
}

/**
 * Disparo server-side manual ou sob demanda da fila de posts agendados.
 * NOTA: A execução periódica oficial roda no PostgreSQL via pg_cron a cada minuto,
 * de modo 100% autônomo (mesmo com navegador e computador desligados).
 */
export async function processScheduledPostsQueue(): Promise<{
  processed: number;
  published: number;
  failed: number;
}> {
  if (!supabase) {
    return { processed: 0, published: 0, failed: 0 };
  }

  try {
    const { data, error } = await supabase.functions.invoke('publish-instagram-post', {
      body: { action: 'process_queue' },
    });

    if (error) {
      console.error('Erro ao acionar fila na Edge Function:', error);
      return { processed: 0, published: 0, failed: 0 };
    }

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('marketing-posts-updated'));
    }

    return data?.summary || { processed: 0, published: 0, failed: 0 };
  } catch (err) {
    console.error('Falha ao acionar processScheduledPostsQueue:', err);
    return { processed: 0, published: 0, failed: 0 };
  }
}

/**
 * Função mantida para compatibilidade com assinaturas anteriores.
 * A fila é processada no servidor pelo pg_cron a cada minuto.
 */
export function startMarketingScheduler(): () => void {
  // O scheduler oficial é server-side (pg_cron). O cliente não precisa rodar setInterval.
  return () => {};
}

export function stopMarketingScheduler(): void {
  // No-op
}
