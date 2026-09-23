import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Configuração Centralizada da Meta Graph API (Auditada)
const META_GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") || "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

interface PublishResult {
  success: boolean;
  externalMediaId?: string;
  error?: string;
}

serve(async (req: Request) => {
  // Trata preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: "Variáveis de ambiente do Supabase ausentes no servidor." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Cliente Supabase com permissões de Service Role (Acesso seguro aos tokens e bypass RLS)
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    const body = await req.json().catch(() => ({}));
    const { action = "process_queue", postId, publishNow = false } = body;

    // ── VALIDAÇÃO DE AUTORIZAÇÃO (CRITÉRIO DE SEGURANÇA 1) ───────────────────
    if (action === "process_queue") {
      const cronSecretHeader = req.headers.get("x-cron-secret");
      const authHeader = req.headers.get("authorization") || "";

      let isAuthorized = false;
      if (authHeader.includes(supabaseServiceKey)) {
        isAuthorized = true;
      } else if (cronSecretHeader) {
        const { data: secretRow } = await supabase
          .from("marketing_internal_secrets")
          .select("secret_value")
          .eq("key_name", "cron_secret")
          .maybeSingle();

        if (secretRow && secretRow.secret_value === cronSecretHeader) {
          isAuthorized = true;
        }
      }

      if (!isAuthorized) {
        return new Response(
          JSON.stringify({ error: "Acesso não autorizado para acionamento de fila." }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Busca credenciais do Instagram ativas (Lê da tabela privada marketing_instagram_tokens)
    const { data: accounts, error: accErr } = await supabase
      .from("marketing_instagram_accounts")
      .select("id, instagram_user_id, status")
      .eq("status", "connected")
      .order("updated_at", { ascending: false })
      .limit(1);

    if (accErr || !accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({
          error: "Nenhuma conta do Instagram conectada no sistema. Conecte em Configurações > Inteligência de Marketing.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const activeAccount = accounts[0];
    const instagramAccountId = activeAccount.id;
    const instagramUserId = activeAccount.instagram_user_id;

    // Lê o Access Token da tabela privada
    const { data: tokenData, error: tokErr } = await supabase
      .from("marketing_instagram_tokens")
      .select("access_token")
      .eq("account_id", instagramAccountId)
      .maybeSingle();

    if (tokErr || !tokenData || !tokenData.access_token) {
      return new Response(
        JSON.stringify({ error: "Token de acesso do Instagram não encontrado na tabela de segurança." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const accessToken = tokenData.access_token;

    // ── CENÁRIO A: Publicar Imediatamente um Post Específico ──────────────────
    if (action === "publish_now" || (publishNow && postId)) {
      if (!postId) {
        return new Response(
          JSON.stringify({ error: "postId é obrigatório para publicação imediata." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Trava atômica do post específico
      const { data: post, error: postErr } = await supabase
        .from("marketing_posts")
        .select("*")
        .eq("id", postId)
        .single();

      if (postErr || !post) {
        return new Response(
          JSON.stringify({ error: `Post ${postId} não encontrado no banco.` }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Marca como publishing
      await supabase
        .from("marketing_posts")
        .update({
          status: "publishing",
          publishing_lock_until: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", postId);

      const pubResult = await executeInstagramPublish(post, instagramUserId, accessToken);

      if (pubResult.success) {
        await supabase.rpc("complete_marketing_post", {
          p_post_id: postId,
          p_external_media_id: pubResult.externalMediaId || "",
        });
        return new Response(
          JSON.stringify({ success: true, postId, externalMediaId: pubResult.externalMediaId }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        await supabase.rpc("fail_marketing_post", {
          p_post_id: postId,
          p_error_message: pubResult.error || "Falha na publicação",
          p_max_retries: 3,
        });
        return new Response(
          JSON.stringify({ success: false, postId, error: pubResult.error }),
          { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── CENÁRIO B: Processar Fila de Agendados Vencidos (Job Server-Side) ────
    // Executa aquisição atômica com FOR UPDATE SKIP LOCKED
    const { data: claimedPosts, error: claimErr } = await supabase.rpc(
      "claim_scheduled_marketing_posts",
      { p_batch_size: 5, p_lock_duration_minutes: 5 }
    );

    if (claimErr) {
      return new Response(
        JSON.stringify({ error: `Erro ao adquirir lock da fila: ${claimErr.message}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const posts = claimedPosts || [];
    let processed = 0;
    let published = 0;
    let failed = 0;
    const details = [];

    for (const post of posts) {
      processed++;
      const pubResult = await executeInstagramPublish(post, instagramUserId, accessToken);

      if (pubResult.success) {
        published++;
        await supabase.rpc("complete_marketing_post", {
          p_post_id: post.id,
          p_external_media_id: pubResult.externalMediaId || "",
        });
        details.push({ id: post.id, status: "published", mediaId: pubResult.externalMediaId });
      } else {
        failed++;
        await supabase.rpc("fail_marketing_post", {
          p_post_id: post.id,
          p_error_message: pubResult.error || "Falha na publicação",
          p_max_retries: 3,
        });
        details.push({ id: post.id, status: "failed", error: pubResult.error });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        summary: { processed, published, failed },
        details,
        timestamp: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: err.message || "Erro interno na Edge Function" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

/**
 * Função central e única de publicação na Meta Graph API (v21.0)
 */
async function executeInstagramPublish(
  post: any,
  instagramUserId: string,
  accessToken: string
): Promise<PublishResult> {
  const mediaUrls = (post.media_urls || []).filter(
    (url: string) => url && typeof url === "string" && url.startsWith("http")
  );

  if (mediaUrls.length === 0) {
    return {
      success: false,
      error: "O post não contém nenhuma URL de mídia pública acessível pela Meta.",
    };
  }

  try {
    let containerId: string;

    // 1. Post de Imagem Única
    if (mediaUrls.length === 1 && post.post_type !== "reel") {
      const res = await fetch(`${GRAPH_API_BASE}/${instagramUserId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image_url: mediaUrls[0],
          caption: post.caption,
          access_token: accessToken,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.id) {
        return {
          success: false,
          error: data.error?.message || `Falha ao criar container de imagem (HTTP ${res.status})`,
        };
      }
      containerId = data.id;
    }
    // 2. Post Carrossel (> 1 foto)
    else if (mediaUrls.length > 1) {
      const childContainerIds: string[] = [];

      for (let i = 0; i < Math.min(mediaUrls.length, 10); i++) {
        const itemUrl = mediaUrls[i];
        const itemRes = await fetch(`${GRAPH_API_BASE}/${instagramUserId}/media`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            image_url: itemUrl,
            is_carousel_item: true,
            access_token: accessToken,
          }),
        });

        const itemData = await itemRes.json();
        if (!itemRes.ok || !itemData.id) {
          return {
            success: false,
            error: `Falha ao preparar item ${i + 1} do carrossel: ${itemData.error?.message || "Erro Meta"}`,
          };
        }
        childContainerIds.push(itemData.id);
      }

      // Cria container mestre do Carrossel
      const carouselRes = await fetch(`${GRAPH_API_BASE}/${instagramUserId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "CAROUSEL",
          children: childContainerIds.join(","),
          caption: post.caption,
          access_token: accessToken,
        }),
      });

      const carouselData = await carouselRes.json();
      if (!carouselRes.ok || !carouselData.id) {
        return {
          success: false,
          error: `Falha ao criar container do carrossel: ${carouselData.error?.message || "Erro Meta"}`,
        };
      }
      containerId = carouselData.id;
    }
    // 3. Post de Vídeo / Reel
    else if (post.post_type === "reel") {
      const reelRes = await fetch(`${GRAPH_API_BASE}/${instagramUserId}/media`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          media_type: "REELS",
          video_url: mediaUrls[0],
          caption: post.caption,
          access_token: accessToken,
        }),
      });

      const reelData = await reelRes.json();
      if (!reelRes.ok || !reelData.id) {
        return {
          success: false,
          error: `Falha ao criar container do Reel: ${reelData.error?.message || "Erro Meta"}`,
        };
      }
      containerId = reelData.id;

      // Polling de processamento do vídeo
      let isReady = false;
      for (let attempt = 0; attempt < 12; attempt++) {
        await new Promise((r) => setTimeout(r, 4000));
        const statusRes = await fetch(
          `${GRAPH_API_BASE}/${containerId}?fields=status_code&access_token=${accessToken}`
        );
        const statusData = await statusRes.json();

        if (statusData.status_code === "FINISHED") {
          isReady = true;
          break;
        } else if (statusData.status_code === "ERROR") {
          return { success: false, error: "Processamento de vídeo rejeitado pela Meta." };
        }
      }

      if (!isReady) {
        return {
          success: false,
          error: "Tempo limite esgotado no processamento do Reel na Meta.",
        };
      }
    } else {
      return { success: false, error: `Tipo de post inválido: ${post.post_type}` };
    }

    // Publicação Efetiva (media_publish)
    const pubRes = await fetch(`${GRAPH_API_BASE}/${instagramUserId}/media_publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        creation_id: containerId,
        access_token: accessToken,
      }),
    });

    const pubData = await pubRes.json();
    if (!pubRes.ok || !pubData.id) {
      return {
        success: false,
        error: pubData.error?.message || `Falha na publicação final (HTTP ${pubRes.status})`,
      };
    }

    return {
      success: true,
      externalMediaId: pubData.id,
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Exceção na chamada da Meta Graph API: ${err.message}`,
    };
  }
}
