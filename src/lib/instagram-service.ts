import type { MarketingPost } from '../types/marketing';
import { getInstagramAccount } from './marketing-db';

const GRAPH_API_BASE = 'https://graph.facebook.com/v21.0';

export interface InstagramTestResult {
  success: boolean;
  message: string;
  accountData?: {
    id: string;
    username: string;
    profile_picture_url?: string;
  };
}

export interface PublishResult {
  success: boolean;
  externalMediaId?: string;
  permalink?: string;
  error?: string;
}

/**
 * Valida a conexão com a API da Meta e busca informações da conta
 */
export async function testInstagramConnection(
  accessToken: string,
  businessAccountId?: string
): Promise<InstagramTestResult> {
  const token = accessToken.trim();
  if (!token) {
    return { success: false, message: 'Access Token não fornecido.' };
  }

  try {
    // 1. Se o ID da conta de negócios do IG foi fornecido, consulta direto nela
    if (businessAccountId && businessAccountId.trim()) {
      const igRes = await fetch(
        `${GRAPH_API_BASE}/${businessAccountId.trim()}?fields=id,username,name,profile_picture_url&access_token=${token}`
      );
      const igData = await igRes.json();
      if (igRes.ok && igData.id) {
        return {
          success: true,
          message: `Conexão válida com @${igData.username || igData.name || igData.id}!`,
          accountData: igData,
        };
      }
    }

    // 2. Consulta o token no endpoint /me
    const meRes = await fetch(`${GRAPH_API_BASE}/me?fields=id,name&access_token=${token}`);
    const meData = await meRes.json();

    if (!meRes.ok || !meData.id) {
      return {
        success: false,
        message: meData.error?.message || `Erro HTTP ${meRes.status} da API da Meta.`,
      };
    }

    // 3. Tenta localizar as contas do Instagram vinculadas a essa página/usuário
    const accountsRes = await fetch(
      `${GRAPH_API_BASE}/me/accounts?fields=id,name,instagram_business_account{id,username,profile_picture_url}&access_token=${token}`
    );
    const accountsData = await accountsRes.json();

    if (accountsRes.ok && accountsData.data && accountsData.data.length > 0) {
      for (const page of accountsData.data) {
        if (page.instagram_business_account) {
          const ig = page.instagram_business_account;
          return {
            success: true,
            message: `Conexão bem-sucedida com a conta @${ig.username || ig.id}!`,
            accountData: ig,
          };
        }
      }
    }

    return {
      success: true,
      message: `Token validado para ${meData.name || meData.id}. Se for perfil comercial do Instagram, configure o Business Account ID.`,
      accountData: { id: meData.id, username: meData.name || meData.id },
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Falha de rede ao conectar à API da Meta.',
    };
  }
}

/**
 * Aguarda o processamento do container de mídia pela Meta quando necessário (ex: vídeos)
 */
async function waitForContainer(
  containerId: string,
  accessToken: string,
  maxAttempts = 15
): Promise<boolean> {
  for (let i = 0; i < maxAttempts; i++) {
    const res = await fetch(
      `${GRAPH_API_BASE}/${containerId}?fields=status_code&access_token=${accessToken}`
    );
    const data = await res.json();
    if (data.status_code === 'FINISHED') return true;
    if (data.status_code === 'ERROR') {
      throw new Error('Falha no processamento da mídia pelo Instagram.');
    }
    // Aguarda 2 segundos entre checagens
    await new Promise((r) => setTimeout(r, 2000));
  }
  return true;
}

/**
 * Pipeline Central Unificado de Publicação (Fase 12):
 * Usado tanto para "Publicar Agora" quanto para o Scheduler de posts programados.
 */
export async function publishPostToInstagram(
  post: MarketingPost,
  providedToken?: string,
  providedAccountId?: string
): Promise<PublishResult> {
  const account = await getInstagramAccount();
  const token = (providedToken || account.access_token || '').trim();
  const accountId = (providedAccountId || account.instagram_user_id || '').trim();

  if (!token) {
    return {
      success: false,
      error: 'Token do Instagram não configurado. Conecte sua conta em Configurações > Inteligência de Marketing.',
    };
  }

  if (!accountId) {
    return {
      success: false,
      error: 'ID da conta comercial do Instagram não configurado. Verifique as configurações da Meta.',
    };
  }

  const mediaUrls = (post.media_urls || []).filter((url) => url && url.startsWith('http'));
  if (mediaUrls.length === 0) {
    return {
      success: false,
      error: 'O post precisa conter pelo menos 1 mídia com URL pública válida acessível pela Meta.',
    };
  }

  try {
    let containerId: string;

    // ── Cenário 1: Post de Imagem Única ──
    if (mediaUrls.length === 1 && post.post_type !== 'reel') {
      const createRes = await fetch(`${GRAPH_API_BASE}/${accountId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image_url: mediaUrls[0],
          caption: post.caption,
          access_token: token,
        }),
      });

      const createData = await createRes.json();
      if (!createRes.ok || !createData.id) {
        return {
          success: false,
          error: createData.error?.message || `Falha ao criar container: HTTP ${createRes.status}`,
        };
      }
      containerId = createData.id;
    }
    // ── Cenário 2: Carrossel (Múltiplas Imagens) ──
    else if (mediaUrls.length > 1) {
      // 1. Cria cada item filho do carrossel
      const childContainerIds: string[] = [];
      for (const url of mediaUrls) {
        const isVideo = url.endsWith('.mp4') || url.endsWith('.mov');
        const childBody: any = {
          is_carousel_item: true,
          access_token: token,
        };
        if (isVideo) {
          childBody.media_type = 'VIDEO';
          childBody.video_url = url;
        } else {
          childBody.image_url = url;
        }

        const childRes = await fetch(`${GRAPH_API_BASE}/${accountId}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(childBody),
        });

        const childData = await childRes.json();
        if (!childRes.ok || !childData.id) {
          return {
            success: false,
            error: childData.error?.message || 'Falha ao processar item do carrossel.',
          };
        }
        childContainerIds.push(childData.id);
      }

      // 2. Cria o container pai do carrossel com a legenda
      const carouselRes = await fetch(`${GRAPH_API_BASE}/${accountId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'CAROUSEL',
          caption: post.caption,
          children: childContainerIds,
          access_token: token,
        }),
      });

      const carouselData = await carouselRes.json();
      if (!carouselRes.ok || !carouselData.id) {
        return {
          success: false,
          error: carouselData.error?.message || 'Falha ao montar o carrossel.',
        };
      }
      containerId = carouselData.id;
    }
    // ── Cenário 3: Reel / Vídeo ──
    else {
      const videoRes = await fetch(`${GRAPH_API_BASE}/${accountId}/media`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          media_type: 'REELS',
          video_url: mediaUrls[0],
          caption: post.caption,
          access_token: token,
        }),
      });

      const videoData = await videoRes.json();
      if (!videoRes.ok || !videoData.id) {
        return {
          success: false,
          error: videoData.error?.message || 'Falha ao criar container de vídeo.',
        };
      }
      containerId = videoData.id;
      // Aguarda o processamento do vídeo
      await waitForContainer(containerId, token);
    }

    // ── ETAPA 2: Publicação Oficial (media_publish) ──
    const publishRes = await fetch(`${GRAPH_API_BASE}/${accountId}/media_publish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: token,
      }),
    });

    const publishData = await publishRes.json();
    if (!publishRes.ok || !publishData.id) {
      return {
        success: false,
        error: publishData.error?.message || `Falha na publicação: HTTP ${publishRes.status}`,
      };
    }

    return {
      success: true,
      externalMediaId: publishData.id,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Erro inesperado durante a publicação no Instagram.',
    };
  }
}
