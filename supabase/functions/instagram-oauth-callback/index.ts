import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const META_GRAPH_VERSION = Deno.env.get("META_GRAPH_VERSION") || "v21.0";

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);

  // Tratamento de Deauthorize ou Data Deletion (Meta Requisitos)
  if (req.method === "POST" && (url.pathname.includes("deauthorize") || url.pathname.includes("delete"))) {
    return new Response(JSON.stringify({ url: "https://meusimoveis.com.br/privacy", confirmation_code: "ok" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const clientId = Deno.env.get("INSTAGRAM_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("INSTAGRAM_CLIENT_SECRET") || "";

  // 1. Tratamento de Erro / Cancelamento do Usuário
  const error = url.searchParams.get("error");
  const errorReason = url.searchParams.get("error_reason");
  const errorDescription = url.searchParams.get("error_description");
  const rawState = url.searchParams.get("state") || "";

  let returnUrl = "http://localhost:3001";
  try {
    if (rawState) {
      const decodedState = JSON.parse(atob(rawState));
      if (decodedState.returnUrl) returnUrl = decodedState.returnUrl;
    }
  } catch {}

  if (error || errorReason) {
    const redirectUrl = new URL(returnUrl);
    redirectUrl.searchParams.set("tab", "marketing");
    redirectUrl.searchParams.set("instagram", "error");
    redirectUrl.searchParams.set("error_reason", errorReason || error || "unknown");
    if (errorDescription) redirectUrl.searchParams.set("error_description", errorDescription);

    return Response.redirect(redirectUrl.toString(), 302);
  }

  const code = url.searchParams.get("code");
  if (!code) {
    return new Response(JSON.stringify({ error: "Parâmetro 'code' ausente no callback OAuth." }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!clientId || !clientSecret) {
    const redirectUrl = new URL(returnUrl);
    redirectUrl.searchParams.set("tab", "marketing");
    redirectUrl.searchParams.set("instagram", "error");
    redirectUrl.searchParams.set(
      "error_description",
      "Variáveis INSTAGRAM_CLIENT_ID ou INSTAGRAM_CLIENT_SECRET não configuradas no servidor."
    );
    return Response.redirect(redirectUrl.toString(), 302);
  }

  const redirectUri =
    Deno.env.get("INSTAGRAM_REDIRECT_URI") ||
    (supabaseUrl
      ? `${supabaseUrl.replace(/\/$/, "")}/functions/v1/instagram-oauth-callback`
      : "https://qedptmrcvcbzhucoeznd.supabase.co/functions/v1/instagram-oauth-callback");

  try {
    // 2. Troca o código pelo Token de Acesso de Curta Duração
    // Suporta Instagram Login API
    const tokenFormData = new URLSearchParams();
    tokenFormData.append("client_id", clientId);
    tokenFormData.append("client_secret", clientSecret);
    tokenFormData.append("grant_type", "authorization_code");
    tokenFormData.append("redirect_uri", redirectUri);
    // Remove #_ trailing inserido pelo Instagram no code se houver
    const cleanCode = code.replace(/#_$/, "");
    tokenFormData.append("code", cleanCode);

    const tokenRes = await fetch("https://api.instagram.com/oauth/access_token", {
      method: "POST",
      body: tokenFormData,
    });

    const tokenJson = await tokenRes.json();
    if (!tokenRes.ok || !tokenJson.access_token) {
      const errMsg = tokenJson.error_message || tokenJson.error?.message || "Falha na troca do code por token.";
      const redirectUrl = new URL(returnUrl);
      redirectUrl.searchParams.set("tab", "marketing");
      redirectUrl.searchParams.set("instagram", "error");
      redirectUrl.searchParams.set("error_description", errMsg);
      return Response.redirect(redirectUrl.toString(), 302);
    }

    const shortLivedToken = tokenJson.access_token;
    const initialUserId = tokenJson.user_id ? String(tokenJson.user_id) : "";

    // 3. Troca pelo Token de Longa Duração (60 dias)
    let finalAccessToken = shortLivedToken;
    let tokenExpiresAt: string | null = null;

    try {
      const exchangeUrl = `https://graph.instagram.com/access_token?grant_type=ig_exchange_token&client_secret=${clientSecret}&access_token=${shortLivedToken}`;
      const exchangeRes = await fetch(exchangeUrl);
      const exchangeJson = await exchangeRes.json();
      if (exchangeRes.ok && exchangeJson.access_token) {
        finalAccessToken = exchangeJson.access_token;
        if (exchangeJson.expires_in) {
          tokenExpiresAt = new Date(Date.now() + exchangeJson.expires_in * 1000).toISOString();
        }
      }
    } catch (e) {
      console.warn("Aviso ao trocar token de longa duração:", e);
    }

    // 4. Consulta Perfil da Conta Conectada
    let username = "conta_instagram";
    let accountName = "Instagram User";
    let accountType = "BUSINESS";
    let profilePic = "";
    let finalInstagramUserId = initialUserId;

    try {
      const meRes = await fetch(
        `https://graph.instagram.com/${META_GRAPH_VERSION}/me?fields=id,username,name,account_type,profile_picture_url&access_token=${finalAccessToken}`
      );
      const meJson = await meRes.json();
      if (meRes.ok && meJson.id) {
        finalInstagramUserId = meJson.id;
        if (meJson.username) username = meJson.username;
        if (meJson.name) accountName = meJson.name;
        if (meJson.account_type) accountType = meJson.account_type;
        if (meJson.profile_picture_url) profilePic = meJson.profile_picture_url;
      }
    } catch (e) {
      console.warn("Aviso ao consultar perfil /me:", e);
    }

    // 5. Armazena com Segurança Máxima no Banco via Service Role
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { error: rpcErr } = await supabase.rpc("save_instagram_account_with_token", {
      p_instagram_user_id: finalInstagramUserId,
      p_username: username,
      p_account_type: accountType,
      p_access_token: finalAccessToken,
      p_token_expires_at: tokenExpiresAt,
    });

    if (rpcErr) {
      console.error("Erro ao persistir conta via RPC no banco:", rpcErr);
      const redirectUrl = new URL(returnUrl);
      redirectUrl.searchParams.set("tab", "marketing");
      redirectUrl.searchParams.set("instagram", "error");
      redirectUrl.searchParams.set("error_description", `Falha no banco: ${rpcErr.message}`);
      return Response.redirect(redirectUrl.toString(), 302);
    }

    // 6. Redirecionamento de Sucesso de Volta ao MEUS IMÓVEIS
    const redirectUrl = new URL(returnUrl);
    redirectUrl.searchParams.set("tab", "marketing");
    redirectUrl.searchParams.set("instagram", "connected");
    redirectUrl.searchParams.set("username", username);

    return Response.redirect(redirectUrl.toString(), 302);
  } catch (err: any) {
    console.error("Exceção no processamento do OAuth:", err);
    const redirectUrl = new URL(returnUrl);
    redirectUrl.searchParams.set("tab", "marketing");
    redirectUrl.searchParams.set("instagram", "error");
    redirectUrl.searchParams.set("error_description", err.message || "Erro inesperado");
    return Response.redirect(redirectUrl.toString(), 302);
  }
});
