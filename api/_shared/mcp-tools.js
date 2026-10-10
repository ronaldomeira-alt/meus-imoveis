import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Carrega .env em ambiente local se necessário
try {
  const envPath = path.resolve(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    const rawEnv = fs.readFileSync(envPath, 'utf-8');
    rawEnv.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const k = trimmed.slice(0, eqIdx).trim();
        let v = trimmed.slice(eqIdx + 1).trim();
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
          v = v.slice(1, -1);
        }
        if (!process.env[k]) {
          process.env[k] = v;
        }
      }
    });
  }
} catch {
  // Ignora se não existir
}

const MAX_IMAGE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB
const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

function getSupabaseClient() {
  const url = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !serviceKey || serviceKey === 'undefined') {
    throw new Error('Supabase Service Role não configurado (SUPABASE_SERVICE_ROLE_KEY ausente).');
  }
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getAccountId() {
  const acc = (
    process.env.MEUS_IMOVEIS_ACCOUNT_ID ||
    process.env.MATCH_CANONICAL_ACCOUNT_ID ||
    ''
  ).trim();
  if (!acc) {
    throw new Error('Conta do CRM não configurada (MEUS_IMOVEIS_ACCOUNT_ID ou MATCH_CANONICAL_ACCOUNT_ID ausente).');
  }
  return acc;
}

function getS3Client() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    return null;
  }
  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

/**
 * Registra log de auditoria de operações de escrita
 */
export async function logMcpAudit({ tool, affected_ids = [], payload = {}, result = {} }) {
  const timestamp = new Date().toISOString();
  console.log(`[MCP AUDIT] ${timestamp} | Tool: ${tool} | Affected: [${affected_ids.join(', ')}]`);

  try {
    const supabase = getSupabaseClient();
    const accountId = getAccountId();
    await supabase.from('mcp_audit_logs').insert({
      account_id: accountId,
      tool_name: tool,
      affected_ids,
      payload,
      result,
      created_at: timestamp,
    });
  } catch (err) {
    // Log silencioso se a tabela ainda não foi migrada
    console.warn('[MCP AUDIT] Falha ao persistir log no Supabase (não-bloqueante):', err.message);
  }
}

/**
 * Normaliza string para busca sem acentos e minúscula
 */
function normalizeText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Converte status do Grok para o formato do CRM
 */
function mapStatusToStage(status) {
  if (!status) return 'Lançamento';
  const clean = normalizeText(status).replace(/-/g, '_');
  if (clean.includes('lancamento')) return 'Lançamento';
  if (clean.includes('construcao') || clean.includes('obra')) return 'Em construção';
  if (clean.includes('pronto')) return 'Pronto para morar';
  if (clean.includes('pre') || clean.includes('breve')) return 'Pré-lançamento';
  return 'Lançamento';
}

/**
 * Converte URLs públicas do Google Drive ou Dropbox para download direto
 */
export function normalizeDownloadUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return rawUrl;
  let url = rawUrl.trim();

  // Google Drive: links do tipo /file/d/{id}/view ou ?id={id}
  const driveFileMatch = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (driveFileMatch && driveFileMatch[1]) {
    const id = driveFileMatch[1];
    return `https://lh3.googleusercontent.com/d/${id}`;
  }

  const driveQueryMatch = url.match(/drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/i);
  if (driveQueryMatch && driveQueryMatch[1]) {
    const id = driveQueryMatch[1];
    return `https://lh3.googleusercontent.com/d/${id}`;
  }

  // Dropbox: dl=0 -> dl=1
  if (url.includes('dropbox.com')) {
    if (url.includes('dl=0')) {
      return url.replace('dl=0', 'dl=1');
    }
    if (!url.includes('dl=1') && !url.includes('raw=1')) {
      const sep = url.includes('?') ? '&' : '?';
      return `${url}${sep}dl=1`;
    }
  }

  return url;
}

/**
 * Gera um ID único e consistente para um empreendimento
 */
function generateDevelopmentId(chaveExterna) {
  const hash = crypto.createHash('md5').update(String(chaveExterna || Date.now())).digest('hex').slice(0, 12);
  return `dev-${Date.now()}-${hash}`;
}

/**
 * Fila de locks atômicos por empreendimento no processo Node.js.
 * Garante que chamadas simultâneas ao mesmo empreendimento sejam serializadas de forma estrita.
 */
const devLocks = new Map();

export async function withDevelopmentLock(key, fn) {
  const lockKey = String(key || 'global');
  const prev = devLocks.get(lockKey) || Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  devLocks.set(lockKey, prev.then(() => current));
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (devLocks.get(lockKey) === current) {
      devLocks.delete(lockKey);
    }
  }
}

/**
 * 1. buscar_empreendimentos
 */
export async function buscarEmpreendimentos({ texto = '', construtora = '', bairro = '', limite = 20, offset = 0 } = {}) {
  const supabase = getSupabaseClient();
  const accountId = getAccountId();

  const take = Math.min(Math.max(Number(limite) || 20, 1), 100);
  const skip = Math.max(Number(offset) || 0, 0);

  const { data, error } = await supabase
    .from('inventory_properties')
    .select('property_id, property_data, updated_at')
    .eq('account_id', accountId)
    .order('updated_at', { ascending: false });

  if (error) throw new Error(`Erro ao buscar empreendimentos: ${error.message}`);

  const normTexto = normalizeText(texto);
  const normConstrutora = normalizeText(construtora);
  const normBairro = normalizeText(bairro);

  const filtered = (data || [])
    .map((row) => ({
      id: row.property_id,
      data: row.property_data || {},
      updated_at: row.updated_at,
    }))
    .filter(({ data: p }) => {
      // Prioriza empreendimentos ou imóveis que tenham nome ou construtora
      const nome = normalizeText(p.condominium_name || p.title || p.nome || '');
      const constr = normalizeText(p.partner_name || p.construtora || '');
      const b = normalizeText(p.neighborhood || p.bairro || '');
      const chave = normalizeText(p.chave_externa || '');

      if (normConstrutora && !constr.includes(normConstrutora)) return false;
      if (normBairro && !b.includes(normBairro)) return false;
      if (normTexto) {
        const matchesNome = nome.includes(normTexto);
        const matchesConstr = constr.includes(normTexto);
        const matchesBairro = b.includes(normTexto);
        const matchesChave = chave.includes(normTexto);
        if (!matchesNome && !matchesConstr && !matchesBairro && !matchesChave) return false;
      }
      return true;
    });

  const total = filtered.length;
  const paged = filtered.slice(skip, skip + take);

  const itens = paged.map(({ id, data: p, updated_at }) => ({
    id,
    chave_externa: p.chave_externa || null,
    nome: p.condominium_name || p.title || p.nome || 'Sem nome',
    construtora: p.partner_name || p.construtora || null,
    bairro: p.neighborhood || p.bairro || null,
    cidade: p.cidade || p.city || 'João Pessoa',
    status: p.stage || p.status || 'Ativo',
    ativo: p.status !== 'Arquivado' && p.ativo !== false,
    preco_a_partir_de: p.price_from !== undefined && p.price_from !== null ? p.price_from : (p.price !== undefined && p.price !== null ? p.price : null),
    area_min_m2: p.area_range?.min !== undefined && p.area_range?.min !== null ? p.area_range.min : (p.area_m2 !== undefined && p.area_m2 !== null ? p.area_m2 : null),
    area_max_m2: p.area_range?.max !== undefined && p.area_range?.max !== null ? p.area_range.max : null,
    vagas: p.parking_spaces !== undefined && p.parking_spaces !== null ? p.parking_spaces : null,
    observacao: p.observacao || p.internal_notes || null,
    fotos_count: Array.isArray(p.photos) ? p.photos.length : 0,
    unidades_count: Array.isArray(p.units) ? p.units.length : 0,
    atualizado_em: p.updated_at || updated_at,
  }));

  return {
    total,
    limite: take,
    offset: skip,
    has_more: skip + take < total,
    itens,
  };
}

/**
 * Encontra um registro pelo ID ou pela chave_externa
 */
async function findDevelopment(supabase, accountId, { id, chave_externa }) {
  if (!id && !chave_externa) {
    throw new Error('É necessário fornecer "id" ou "chave_externa".');
  }

  if (id) {
    const { data } = await supabase
      .from('inventory_properties')
      .select('property_id, property_data, updated_at')
      .eq('account_id', accountId)
      .eq('property_id', String(id))
      .maybeSingle();

    if (data) return data;
  }

  // Busca por chave_externa dentro do JSON ou na lista
  if (chave_externa) {
    const { data: rows } = await supabase
      .from('inventory_properties')
      .select('property_id, property_data, updated_at')
      .eq('account_id', accountId)
      .filter('property_data->>chave_externa', 'eq', String(chave_externa));

    if (rows && rows.length > 0) return rows[0];

    // Fallback: busca onde property_id seja igual à chave_externa
    const { data: fallback } = await supabase
      .from('inventory_properties')
      .select('property_id, property_data, updated_at')
      .eq('account_id', accountId)
      .eq('property_id', String(chave_externa))
      .maybeSingle();

    if (fallback) return fallback;
  }

  return null;
}

/**
 * 2. obter_empreendimento
 */
export async function obterEmpreendimento({ id = null, chave_externa = null } = {}) {
  const supabase = getSupabaseClient();
  const accountId = getAccountId();

  const found = await findDevelopment(supabase, accountId, { id, chave_externa });
  if (!found) {
    throw new Error(`Empreendimento não encontrado para id="${id}" ou chave_externa="${chave_externa}".`);
  }

  const p = found.property_data || {};
  const photos = Array.isArray(p.photos) ? p.photos : [];
  const units = Array.isArray(p.units) ? p.units : [];

  return {
    id: found.property_id,
    chave_externa: p.chave_externa || null,
    nome: p.condominium_name || p.title || p.nome || '',
    construtora: p.partner_name || p.construtora || '',
    bairro: p.neighborhood || p.bairro || '',
    cidade: p.cidade || p.city || 'João Pessoa',
    endereco: p.address || p.endereco || '',
    status: p.stage || 'Lançamento',
    ativo: p.status !== 'Arquivado' && p.ativo !== false,
    entrega: p.delivery_date || p.entrega || '',
    preco_a_partir_de: p.price_from !== undefined && p.price_from !== null ? p.price_from : (p.price !== undefined && p.price !== null ? p.price : null),
    area_min_m2: p.area_range?.min !== undefined && p.area_range?.min !== null ? p.area_range.min : (p.area_m2 !== undefined && p.area_m2 !== null ? p.area_m2 : null),
    area_max_m2: p.area_range?.max !== undefined && p.area_range?.max !== null ? p.area_range.max : null,
    quartos_min: p.bedrooms_options?.length ? Math.min(...p.bedrooms_options) : (p.bedrooms !== undefined && p.bedrooms !== null ? p.bedrooms : null),
    quartos_max: p.bedrooms_options?.length ? Math.max(...p.bedrooms_options) : (p.bedrooms !== undefined && p.bedrooms !== null ? p.bedrooms : null),
    vagas: p.parking_spaces !== undefined && p.parking_spaces !== null ? p.parking_spaces : null,
    descricao: p.notes || p.descricao || '',
    observacao: p.observacao || p.internal_notes || null,
    diferenciais: Array.isArray(p.building_features) ? p.building_features : (p.diferenciais || []),
    link_tabela: p.link_tabela || '',
    link_pasta: p.link_pasta || '',
    data_tabela: p.data_tabela || '',
    fotos_count: photos.length,
    unidades_count: units.length,
    fotos: photos,
    unidades: units,
    atualizado_em: p.updated_at || found.updated_at,
  };
}

/**
 * 3. upsert_empreendimento (idempotente por chave_externa)
 */
export async function upsertEmpreendimento(params = {}) {
  const {
    chave_externa,
    nome,
    construtora,
    bairro,
    cidade = 'João Pessoa',
    endereco = '',
    status = 'lancamento',
    entrega = '',
    preco_a_partir_de,
    area_min_m2,
    area_max_m2,
    quartos_min,
    quartos_max,
    vagas,
    descricao = '',
    observacao = null,
    diferenciais = [],
    link_tabela = '',
    link_pasta = '',
    data_tabela = '',
    ativo = true,
  } = params;

  if (!chave_externa || typeof chave_externa !== 'string' || !chave_externa.trim()) {
    throw new Error('Campo "chave_externa" é obrigatório para garantir idempotência.');
  }

  const supabase = getSupabaseClient();
  const accountId = getAccountId();

  const existingRow = await findDevelopment(supabase, accountId, { chave_externa });
  const isCreate = !existingRow;
  const existingData = isCreate ? {} : (existingRow.property_data || {});
  const propertyId = isCreate ? generateDevelopmentId(chave_externa) : existingRow.property_id;

  if (isCreate && !nome) {
    throw new Error('Campo "nome" é obrigatório ao cadastrar um novo empreendimento.');
  }

  const finalNome = nome !== undefined ? String(nome).trim() : (existingData.condominium_name || existingData.title || '');
  const finalConstrutora = construtora !== undefined ? String(construtora).trim() : (existingData.partner_name || '');
  const finalBairro = bairro !== undefined ? String(bairro).trim() : (existingData.neighborhood || '');
  const finalCidade = cidade !== undefined ? String(cidade).trim() : (existingData.cidade || 'João Pessoa');
  const finalEndereco = endereco !== undefined ? String(endereco).trim() : (existingData.address || '');
  const finalStage = status !== undefined ? mapStatusToStage(status) : (existingData.stage || 'Lançamento');
  const finalEntrega = entrega !== undefined ? String(entrega).trim() : (existingData.delivery_date || '');
  const finalPrecoFrom = preco_a_partir_de !== undefined
    ? (preco_a_partir_de !== null ? Number(preco_a_partir_de) : null)
    : (existingData.price_from !== undefined ? existingData.price_from : (existingData.price ?? null));

  let finalAreaMin = null;
  let finalAreaMax = null;
  if (area_min_m2 !== undefined) {
    finalAreaMin = area_min_m2 !== null ? Number(area_min_m2) : null;
  } else {
    finalAreaMin = existingData.area_range?.min !== undefined ? existingData.area_range.min : (existingData.area_m2 ?? null);
  }

  if (area_max_m2 !== undefined) {
    finalAreaMax = area_max_m2 !== null ? Number(area_max_m2) : null;
  } else {
    finalAreaMax = existingData.area_range?.max !== undefined ? existingData.area_range.max : finalAreaMin;
  }

  const finalAreaRange = (finalAreaMin !== null || finalAreaMax !== null)
    ? { min: finalAreaMin ?? finalAreaMax, max: finalAreaMax ?? finalAreaMin }
    : null;

  // Quartos options
  let finalBedroomsOptions = existingData.bedrooms_options || null;
  if (quartos_min !== undefined || quartos_max !== undefined) {
    if (quartos_min === null && quartos_max === null) {
      finalBedroomsOptions = null;
    } else {
      const qMin = Math.max(Number(quartos_min !== undefined && quartos_min !== null ? quartos_min : (quartos_max || 1)), 0);
      const qMax = Math.max(Number(quartos_max !== undefined && quartos_max !== null ? quartos_max : qMin), qMin);
      finalBedroomsOptions = [];
      for (let i = qMin; i <= qMax; i++) {
        finalBedroomsOptions.push(i);
      }
    }
  }

  // Vagas: preserva null se não informado
  let finalVagas = null;
  if (vagas !== undefined) {
    finalVagas = vagas !== null ? Number(vagas) : null;
  } else {
    finalVagas = existingData.parking_spaces !== undefined ? existingData.parking_spaces : null;
  }

  const finalDescricao = descricao !== undefined ? String(descricao).trim() : (existingData.notes || '');
  const finalObservacao = observacao !== undefined
    ? (observacao !== null ? String(observacao).trim() : null)
    : (existingData.observacao || existingData.internal_notes || null);

  const finalDiferenciais = diferenciais !== undefined && Array.isArray(diferenciais) ? diferenciais : (existingData.building_features || []);
  const finalLinkTabela = link_tabela !== undefined ? String(link_tabela).trim() : (existingData.link_tabela || '');
  const finalLinkPasta = link_pasta !== undefined ? String(link_pasta).trim() : (existingData.link_pasta || '');
  const finalDataTabela = data_tabela !== undefined ? String(data_tabela).trim() : (existingData.data_tabela || '');
  const finalAtivo = ativo !== undefined ? Boolean(ativo) : (existingData.status !== 'Arquivado' && existingData.ativo !== false);

  const nowIso = new Date().toISOString();

  const propertyData = {
    ...existingData,
    id: propertyId,
    chave_externa: String(chave_externa).trim(),
    is_development: true,
    title: finalNome,
    condominium_name: finalNome,
    partner_name: finalConstrutora,
    source_type: 'Parceiro',
    neighborhood: finalBairro,
    cidade: finalCidade,
    address: finalEndereco,
    stage: finalStage,
    delivery_date: finalEntrega,
    price_from: finalPrecoFrom,
    price: finalPrecoFrom,
    area_m2: finalAreaMin,
    area_range: finalAreaRange,
    bedrooms: finalBedroomsOptions && finalBedroomsOptions.length > 0 ? finalBedroomsOptions[0] : (existingData.bedrooms ?? null),
    bedrooms_options: finalBedroomsOptions,
    parking_spaces: finalVagas,
    parking_options: finalVagas !== null ? [finalVagas] : null,
    notes: finalDescricao,
    observacao: finalObservacao,
    internal_notes: finalObservacao,
    building_features: finalDiferenciais,
    apartment_features: existingData.apartment_features || [],
    link_tabela: finalLinkTabela,
    link_pasta: finalLinkPasta,
    data_tabela: finalDataTabela,
    ativo: finalAtivo,
    status: finalAtivo ? 'Ativo' : 'Arquivado',
    photos: Array.isArray(existingData.photos) ? existingData.photos : [],
    units: Array.isArray(existingData.units) ? existingData.units : [],
    created_at: existingData.created_at || nowIso,
    updated_at: nowIso,
  };

  const { error } = await supabase.from('inventory_properties').upsert(
    {
      account_id: accountId,
      property_id: propertyId,
      property_data: propertyData,
      updated_at: nowIso,
    },
    { onConflict: 'account_id,property_id' }
  );

  if (error) {
    throw new Error(`Falha ao salvar empreendimento no CRM: ${error.message}`);
  }

  await logMcpAudit({
    tool: 'upsert_empreendimento',
    affected_ids: [propertyId, chave_externa],
    payload: { chave_externa, nome: finalNome, construtora: finalConstrutora, isCreate },
    result: { id: propertyId, criado: isCreate },
  });

  return {
    id: propertyId,
    chave_externa,
    criado: isCreate,
    atualizado_em: nowIso,
  };
}

/**
 * 4. upsert_empreendimentos_lote
 */
export async function upsertEmpreendimentosLote({ itens = [] } = {}) {
  if (!Array.isArray(itens)) {
    throw new Error('Parâmetro "itens" deve ser uma lista de empreendimentos.');
  }

  if (itens.length > 50) {
    throw new Error('Limite máximo de 50 empreendimentos por lote excedido.');
  }

  const resultados = [];
  let criados = 0;
  let atualizados = 0;
  let erros = 0;

  for (const item of itens) {
    try {
      const res = await upsertEmpreendimento(item);
      if (res.criado) criados++;
      else atualizados++;
      resultados.push({ chave_externa: item.chave_externa, ok: true, id: res.id, criado: res.criado });
    } catch (err) {
      erros++;
      resultados.push({ chave_externa: item?.chave_externa || null, ok: false, erro: err.message });
    }
  }

  await logMcpAudit({
    tool: 'upsert_empreendimentos_lote',
    affected_ids: resultados.filter((r) => r.ok).map((r) => r.id),
    payload: { total_itens: itens.length },
    result: { criados, atualizados, erros },
  });

  return {
    total: itens.length,
    criados,
    atualizados,
    erros,
    resultados,
  };
}

/**
 * Faz download de imagem e valida tipo e tamanho
 */
async function downloadAndValidateImage(url) {
  if (!url || typeof url !== 'string') {
    throw new Error('URL da foto inválida ou vazia.');
  }

  // Suporte a data URIs (ex: testes automatizados ou imagens em base64 diretas)
  if (url.startsWith('data:image/')) {
    const cleanBase64 = url.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
    const buffer = Buffer.from(cleanBase64, 'base64');
    if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
      throw new Error(`Imagem excede o limite de 15 MB (${(buffer.length / (1024 * 1024)).toFixed(1)} MB).`);
    }
    let mimeType = 'image/jpeg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) mimeType = 'image/png';
    else if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') mimeType = 'image/webp';
    return { buffer, mimeType };
  }

  const targetUrl = normalizeDownloadUrl(url);

  const res = await fetch(targetUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) MeusImoveisCRM/1.0',
    },
    signal: AbortSignal.timeout(20000),
  });

  if (!res.ok) {
    throw new Error(`Falha ao baixar imagem de ${targetUrl}: HTTP ${res.status} ${res.statusText}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(`Imagem excede o limite de 15 MB (${(buffer.length / (1024 * 1024)).toFixed(1)} MB).`);
  }

  // Identifica mime type
  let mimeType = res.headers.get('content-type') || '';
  mimeType = mimeType.split(';')[0].trim().toLowerCase();

  // Heurística de magic bytes se o header for genérico
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    if (buffer[0] === 0xff && buffer[1] === 0xd8) mimeType = 'image/jpeg';
    else if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) mimeType = 'image/png';
    else if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') mimeType = 'image/webp';
  }

  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    throw new Error(`Formato de imagem inválido ou não suportado (${mimeType || 'desconhecido'}). Envie JPG, PNG ou WEBP.`);
  }

  return { buffer, mimeType };
}

/**
 * Salva buffer no storage (R2 ou Supabase Storage)
 */
async function uploadImageBuffer({ propertyId, buffer, mimeType }) {
  const ext = mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'jpg';
  const uniqueName = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const objectKey = `properties/${propertyId}/photos/${uniqueName}`;

  const s3 = getS3Client();
  const r2Bucket = process.env.R2_BUCKET_NAME || 'rm-imoveis-media';
  const r2PublicBase = (
    process.env.VITE_R2_PUBLIC_URL ||
    process.env.R2_PUBLIC_URL ||
    'https://pub-e28ab031048d44b2aa8b1846c6e6fdc6.r2.dev'
  ).replace(/\/$/, '');

  if (s3) {
    await s3.send(
      new PutObjectCommand({
        Bucket: r2Bucket,
        Key: objectKey,
        Body: buffer,
        ContentType: mimeType,
      })
    );
    const finalUrl = `${r2PublicBase}/${objectKey}`;
    return {
      storage_provider: 'r2',
      object_key: objectKey,
      storage_path: objectKey,
      url: finalUrl,
    };
  }

  // Fallback: Supabase Storage
  const supabase = getSupabaseClient();
  const bucketName = 'property-images';
  const filePath = `${propertyId}/${uniqueName}`;

  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(filePath, buffer, { contentType: mimeType, upsert: true });

  if (uploadError) {
    throw new Error(`Falha no upload para o Supabase Storage: ${uploadError.message}`);
  }

  const { data: publicUrlData } = supabase.storage.from(bucketName).getPublicUrl(filePath);
  return {
    storage_provider: 'supabase',
    object_key: filePath,
    storage_path: filePath,
    url: publicUrlData.publicUrl,
  };
}

/**
 * 5. adicionar_foto
 */
export async function adicionarFoto({
  empreendimento_id = null,
  chave_externa = null,
  url,
  legenda = '',
  ordem = null,
  capa = false,
} = {}) {
  if (!url || typeof url !== 'string') {
    throw new Error('Campo "url" da foto é obrigatório.');
  }

  const supabase = getSupabaseClient();
  const accountId = getAccountId();

  const devRow = await findDevelopment(supabase, accountId, { id: empreendimento_id, chave_externa });
  if (!devRow) {
    throw new Error('Empreendimento não encontrado para adicionar foto.');
  }

  const propertyId = devRow.property_id;

  return await withDevelopmentLock(propertyId, async () => {
    // 1. Rebusca o registro fresco do imóvel dentro do lock
    const { data: freshRow, error: fetchErr } = await supabase
      .from('inventory_properties')
      .select('property_id, property_data')
      .eq('account_id', accountId)
      .eq('property_id', propertyId)
      .single();

    if (fetchErr || !freshRow) {
      throw new Error(`Empreendimento ${propertyId} não encontrado ao persistir foto: ${fetchErr?.message || 'registro ausente'}`);
    }

    const propertyData = freshRow.property_data || {};
    const currentPhotos = Array.isArray(propertyData.photos) ? [...propertyData.photos] : [];

    // 2. Baixa e valida a imagem
    const { buffer, mimeType } = await downloadAndValidateImage(url);
    const imageHash = crypto.createHash('sha256').update(buffer).digest('hex');

    // 3. Deduplicação por hash
    const existingPhoto = currentPhotos.find((p) => p.hash === imageHash);
    if (existingPhoto) {
      return {
        foto_id: existingPhoto.id,
        url_final: existingPhoto.url || existingPhoto.storage_path,
        legenda: existingPhoto.legenda || legenda,
        ordem: existingPhoto.sort_order,
        capa: existingPhoto.is_cover,
        duplicada: true,
      };
    }

    // 4. Upload no R2 / Storage
    const uploadResult = await uploadImageBuffer({ propertyId, buffer, mimeType });
    const photoId = crypto.randomUUID();
    const isCover = Boolean(capa) || currentPhotos.length === 0;
    const sortOrder = ordem !== null && Number.isFinite(Number(ordem)) ? Number(ordem) : currentPhotos.length;

    // Se esta foto for capa, remove is_cover das outras
    if (isCover) {
      currentPhotos.forEach((p) => {
        p.is_cover = false;
      });
    }

    const newPhoto = {
      id: photoId,
      property_id: propertyId,
      url: uploadResult.url,
      storage_path: uploadResult.storage_path,
      object_key: uploadResult.object_key,
      storage_provider: uploadResult.storage_provider,
      mime_type: mimeType,
      size_bytes: buffer.length,
      hash: imageHash,
      legenda: String(legenda || '').trim(),
      sort_order: sortOrder,
      is_cover: isCover,
      created_at: new Date().toISOString(),
    };

    currentPhotos.push(newPhoto);
    currentPhotos.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    // 5. Grava na tabela property_media para redundância
    try {
      await supabase.from('property_media').insert({
        id: photoId,
        property_id: propertyId,
        object_key: uploadResult.object_key,
        storage_provider: uploadResult.storage_provider,
        storage_path: uploadResult.storage_path,
        media_type: 'photo',
        mime_type: mimeType,
        size_bytes: buffer.length,
        sort_order: sortOrder,
        is_cover: isCover,
        metadata: { hash: imageHash, legenda },
      });
    } catch (err) {
      console.warn('[MCP] Aviso ao inserir em property_media:', err.message);
    }

    // 6. Atualiza o empreendimento no inventário
    propertyData.photos = currentPhotos;
    propertyData.updated_at = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from('inventory_properties')
      .update({ property_data: propertyData, updated_at: propertyData.updated_at })
      .eq('account_id', accountId)
      .eq('property_id', propertyId);

    if (updateErr) {
      throw new Error(`Falha ao persistir foto no empreendimento: ${updateErr.message}`);
    }

    await logMcpAudit({
      tool: 'adicionar_foto',
      affected_ids: [propertyId, photoId],
      payload: { propertyId, photoId, isCover, size_bytes: buffer.length },
      result: { foto_id: photoId, url_final: uploadResult.url },
    });

    return {
      foto_id: photoId,
      url_final: uploadResult.url,
      legenda: newPhoto.legenda,
      ordem: newPhoto.sort_order,
      capa: newPhoto.is_cover,
      duplicada: false,
    };
  });
}

/**
 * 5b. adicionar_fotos_lote
 * Processa fotos em SÉRIE no servidor sob lock atômico por empreendimento.
 * Baixa cada imagem (Drive/Dropbox/Web/DataURI), valida, deduplica por SHA-256 e grava no R2.
 */
export async function adicionarFotosLote({
  empreendimento_id = null,
  chave_externa = null,
  fotos = [],
} = {}) {
  if (!Array.isArray(fotos)) {
    throw new Error('Parâmetro "fotos" deve ser uma lista.');
  }

  if (fotos.length > 30) {
    throw new Error('Limite máximo de 30 fotos por lote excedido.');
  }

  const supabase = getSupabaseClient();
  const accountId = getAccountId();

  const devRow = await findDevelopment(supabase, accountId, { id: empreendimento_id, chave_externa });
  if (!devRow) {
    throw new Error('Empreendimento não encontrado para adicionar fotos em lote.');
  }

  const propertyId = devRow.property_id;

  return await withDevelopmentLock(propertyId, async () => {
    const { data: freshRow, error: fetchErr } = await supabase
      .from('inventory_properties')
      .select('property_id, property_data')
      .eq('account_id', accountId)
      .eq('property_id', propertyId)
      .single();

    if (fetchErr || !freshRow) {
      throw new Error(`Empreendimento ${propertyId} não encontrado: ${fetchErr?.message || 'registro ausente'}`);
    }

    const propertyData = freshRow.property_data || {};
    const currentPhotos = Array.isArray(propertyData.photos) ? [...propertyData.photos] : [];

    const resultados = [];
    let totalGravado = 0;
    let coverPhotoIdToSet = null;

    // Processamento estritamente em SÉRIE
    for (const item of fotos) {
      if (!item || !item.url || typeof item.url !== 'string') {
        resultados.push({ url: item?.url || '', ok: false, erro: 'Campo "url" inválido ou ausente.' });
        continue;
      }

      try {
        const { buffer, mimeType } = await downloadAndValidateImage(item.url);
        const imageHash = crypto.createHash('sha256').update(buffer).digest('hex');

        // Deduplicação por hash SHA-256
        const existingPhoto = currentPhotos.find((p) => p.hash === imageHash);
        if (existingPhoto) {
          if (item.capa) {
            coverPhotoIdToSet = existingPhoto.id;
          }
          resultados.push({
            url: item.url,
            ok: true,
            foto_id: existingPhoto.id,
            duplicada: true,
          });
          continue;
        }

        const uploadResult = await uploadImageBuffer({ propertyId, buffer, mimeType });
        const photoId = crypto.randomUUID();
        const sortOrder = item.ordem !== null && item.ordem !== undefined && Number.isFinite(Number(item.ordem))
          ? Number(item.ordem)
          : currentPhotos.length;

        if (item.capa) {
          coverPhotoIdToSet = photoId;
        }

        const newPhoto = {
          id: photoId,
          property_id: propertyId,
          url: uploadResult.url,
          storage_path: uploadResult.storage_path,
          object_key: uploadResult.object_key,
          storage_provider: uploadResult.storage_provider,
          mime_type: mimeType,
          size_bytes: buffer.length,
          hash: imageHash,
          legenda: String(item.legenda || '').trim(),
          sort_order: sortOrder,
          is_cover: false,
          created_at: new Date().toISOString(),
        };

        currentPhotos.push(newPhoto);
        totalGravado++;

        // Grava na tabela property_media
        try {
          await supabase.from('property_media').insert({
            id: photoId,
            property_id: propertyId,
            object_key: uploadResult.object_key,
            storage_provider: uploadResult.storage_provider,
            storage_path: uploadResult.storage_path,
            media_type: 'photo',
            mime_type: mimeType,
            size_bytes: buffer.length,
            sort_order: sortOrder,
            is_cover: false,
            metadata: { hash: imageHash, legenda: item.legenda },
          });
        } catch (err) {
          console.warn('[MCP] Aviso ao inserir em property_media:', err.message);
        }

        resultados.push({
          url: item.url,
          ok: true,
          foto_id: photoId,
          duplicada: false,
        });
      } catch (err) {
        resultados.push({
          url: item.url,
          ok: false,
          erro: err.message,
        });
      }
    }

    // Se capa=true em alguma, definir como capa ao final
    if (coverPhotoIdToSet) {
      currentPhotos.forEach((p) => {
        p.is_cover = p.id === coverPhotoIdToSet;
      });
    } else if (currentPhotos.length > 0 && !currentPhotos.some((p) => p.is_cover)) {
      currentPhotos[0].is_cover = true;
    }

    currentPhotos.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

    propertyData.photos = currentPhotos;
    propertyData.updated_at = new Date().toISOString();

    const { error: updateErr } = await supabase
      .from('inventory_properties')
      .update({ property_data: propertyData, updated_at: propertyData.updated_at })
      .eq('account_id', accountId)
      .eq('property_id', propertyId);

    if (updateErr) {
      throw new Error(`Falha ao persistir fotos do lote no empreendimento: ${updateErr.message}`);
    }

    await logMcpAudit({
      tool: 'adicionar_fotos_lote',
      affected_ids: [propertyId],
      payload: { total_enviadas: fotos.length, total_gravado: totalGravado },
      result: { total_gravado: totalGravado, cover_id: coverPhotoIdToSet },
    });

    return {
      empreendimento_id: propertyId,
      total_enviadas: fotos.length,
      total_gravado: totalGravado,
      resultados,
    };
  });
}

/**
 * 6. adicionar_foto_base64
 */
export async function adicionarFotoBase64({
  empreendimento_id = null,
  chave_externa = null,
  nome_arquivo = 'foto.jpg',
  base64,
  legenda = '',
  ordem = null,
  capa = false,
} = {}) {
  if (!base64 || typeof base64 !== 'string') {
    throw new Error('Campo "base64" é obrigatório.');
  }

  // Remove cabeçalho data:image/xxx;base64, se presente
  const cleanBase64 = base64.replace(/^data:image\/[a-zA-Z]+;base64,/, '');
  const buffer = Buffer.from(cleanBase64, 'base64');

  if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
    throw new Error(`Imagem excede o limite de 15 MB (${(buffer.length / (1024 * 1024)).toFixed(1)} MB).`);
  }

  let mimeType = 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) mimeType = 'image/png';
  else if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') mimeType = 'image/webp';

  const supabase = getSupabaseClient();
  const accountId = getAccountId();

  const devRow = await findDevelopment(supabase, accountId, { id: empreendimento_id, chave_externa });
  if (!devRow) {
    throw new Error('Empreendimento não encontrado para adicionar foto.');
  }

  const propertyId = devRow.property_id;
  const propertyData = devRow.property_data || {};
  const currentPhotos = Array.isArray(propertyData.photos) ? [...propertyData.photos] : [];

  const imageHash = crypto.createHash('sha256').update(buffer).digest('hex');
  const existingPhoto = currentPhotos.find((p) => p.hash === imageHash);
  if (existingPhoto) {
    return {
      foto_id: existingPhoto.id,
      url_final: existingPhoto.url || existingPhoto.storage_path,
      legenda: existingPhoto.legenda || legenda,
      ordem: existingPhoto.sort_order,
      capa: existingPhoto.is_cover,
      duplicada: true,
    };
  }

  const uploadResult = await uploadImageBuffer({ propertyId, buffer, mimeType });
  const photoId = crypto.randomUUID();
  const isCover = Boolean(capa) || currentPhotos.length === 0;
  const sortOrder = ordem !== null && Number.isFinite(Number(ordem)) ? Number(ordem) : currentPhotos.length;

  if (isCover) {
    currentPhotos.forEach((p) => {
      p.is_cover = false;
    });
  }

  const newPhoto = {
    id: photoId,
    property_id: propertyId,
    url: uploadResult.url,
    storage_path: uploadResult.storage_path,
    object_key: uploadResult.object_key,
    storage_provider: uploadResult.storage_provider,
    mime_type: mimeType,
    size_bytes: buffer.length,
    hash: imageHash,
    legenda: String(legenda || '').trim(),
    sort_order: sortOrder,
    is_cover: isCover,
    created_at: new Date().toISOString(),
  };

  currentPhotos.push(newPhoto);
  propertyData.photos = currentPhotos;
  propertyData.updated_at = new Date().toISOString();

  await supabase
    .from('inventory_properties')
    .update({ property_data: propertyData, updated_at: propertyData.updated_at })
    .eq('account_id', accountId)
    .eq('property_id', propertyId);

  await logMcpAudit({
    tool: 'adicionar_foto_base64',
    affected_ids: [propertyId, photoId],
    payload: { propertyId, photoId, nome_arquivo },
    result: { foto_id: photoId, url_final: uploadResult.url },
  });

  return {
    foto_id: photoId,
    url_final: uploadResult.url,
    legenda: newPhoto.legenda,
    ordem: newPhoto.sort_order,
    capa: newPhoto.is_cover,
    duplicada: false,
  };
}

/**
 * 7a. listar_fotos
 */
export async function listarFotos({ empreendimento_id = null, chave_externa = null } = {}) {
  const supabase = getSupabaseClient();
  const accountId = getAccountId();

  const devRow = await findDevelopment(supabase, accountId, { id: empreendimento_id, chave_externa });
  if (!devRow) {
    throw new Error('Empreendimento não encontrado.');
  }

  const photos = Array.isArray(devRow.property_data?.photos) ? devRow.property_data.photos : [];
  return {
    empreendimento_id: devRow.property_id,
    total: photos.length,
    fotos: photos.map((p) => ({
      id: p.id,
      url: p.url || p.storage_path,
      legenda: p.legenda || '',
      ordem: p.sort_order || 0,
      capa: Boolean(p.is_cover),
      hash: p.hash || null,
    })),
  };
}

/**
 * 7b. remover_foto
 */
export async function removerFoto({ foto_id, empreendimento_id = null } = {}) {
  if (!foto_id) throw new Error('Campo "foto_id" é obrigatório.');

  const supabase = getSupabaseClient();
  const accountId = getAccountId();

  // Localiza o empreendimento que contém a foto
  let devRow = null;
  if (empreendimento_id) {
    devRow = await findDevelopment(supabase, accountId, { id: empreendimento_id });
  }

  if (!devRow) {
    // Procura em todos os empreendimentos do inventário
    const { data: rows } = await supabase
      .from('inventory_properties')
      .select('property_id, property_data')
      .eq('account_id', accountId);

    devRow = (rows || []).find((r) => Array.isArray(r.property_data?.photos) && r.property_data.photos.some((p) => p.id === foto_id));
  }

  if (!devRow) {
    throw new Error(`Foto "${foto_id}" não encontrada no CRM.`);
  }

  const propertyData = devRow.property_data || {};
  const currentPhotos = Array.isArray(propertyData.photos) ? propertyData.photos : [];
  const removedPhoto = currentPhotos.find((p) => p.id === foto_id);
  const nextPhotos = currentPhotos.filter((p) => p.id !== foto_id);

  // Se a removida era capa e ainda existem fotos, torna a primeira como capa
  if (removedPhoto?.is_cover && nextPhotos.length > 0) {
    nextPhotos[0].is_cover = true;
  }

  propertyData.photos = nextPhotos;
  propertyData.updated_at = new Date().toISOString();

  await supabase
    .from('inventory_properties')
    .update({ property_data: propertyData, updated_at: propertyData.updated_at })
    .eq('account_id', accountId)
    .eq('property_id', devRow.property_id);

  // Remove também de property_media
  try {
    await supabase.from('property_media').delete().eq('id', foto_id);
  } catch {}

  await logMcpAudit({
    tool: 'remover_foto',
    affected_ids: [devRow.property_id, foto_id],
    payload: { foto_id },
    result: { removido: true },
  });

  return { sucesso: true, foto_id, empreendimento_id: devRow.property_id };
}

/**
 * 7c. definir_capa
 */
export async function definirCapa({ foto_id, empreendimento_id = null } = {}) {
  if (!foto_id) throw new Error('Campo "foto_id" é obrigatório.');

  const supabase = getSupabaseClient();
  const accountId = getAccountId();

  let devRow = null;
  if (empreendimento_id) {
    devRow = await findDevelopment(supabase, accountId, { id: empreendimento_id });
  }

  if (!devRow) {
    const { data: rows } = await supabase
      .from('inventory_properties')
      .select('property_id, property_data')
      .eq('account_id', accountId);

    devRow = (rows || []).find((r) => Array.isArray(r.property_data?.photos) && r.property_data.photos.some((p) => p.id === foto_id));
  }

  if (!devRow) {
    throw new Error(`Foto "${foto_id}" não encontrada.`);
  }

  const propertyData = devRow.property_data || {};
  const photos = Array.isArray(propertyData.photos) ? propertyData.photos : [];

  let found = false;
  photos.forEach((p) => {
    if (p.id === foto_id) {
      p.is_cover = true;
      found = true;
    } else {
      p.is_cover = false;
    }
  });

  if (!found) throw new Error(`Foto "${foto_id}" não encontrada no empreendimento.`);

  propertyData.photos = photos;
  propertyData.updated_at = new Date().toISOString();

  await supabase
    .from('inventory_properties')
    .update({ property_data: propertyData, updated_at: propertyData.updated_at })
    .eq('account_id', accountId)
    .eq('property_id', devRow.property_id);

  await logMcpAudit({
    tool: 'definir_capa',
    affected_ids: [devRow.property_id, foto_id],
    payload: { foto_id },
    result: { capa: foto_id },
  });

  return { sucesso: true, foto_id, capa: true, empreendimento_id: devRow.property_id };
}

/**
 * 8. upsert_unidades_lote
 */
export async function upsertUnidadesLote({ empreendimento_id = null, chave_externa = null, unidades = [] } = {}) {
  if (!Array.isArray(unidades)) {
    throw new Error('Parâmetro "unidades" deve ser uma lista.');
  }

  if (unidades.length > 200) {
    throw new Error('Limite máximo de 200 unidades por lote excedido.');
  }

  const supabase = getSupabaseClient();
  const accountId = getAccountId();

  const devRow = await findDevelopment(supabase, accountId, { id: empreendimento_id, chave_externa });
  if (!devRow) {
    throw new Error('Empreendimento não encontrado para adicionar unidades.');
  }

  const propertyId = devRow.property_id;

  return await withDevelopmentLock(propertyId, async () => {
    const { data: freshRow, error: fetchErr } = await supabase
      .from('inventory_properties')
      .select('property_id, property_data')
      .eq('account_id', accountId)
      .eq('property_id', propertyId)
      .single();

    if (fetchErr || !freshRow) {
      throw new Error(`Empreendimento ${propertyId} não encontrado: ${fetchErr?.message || 'registro ausente'}`);
    }

    const propertyData = freshRow.property_data || {};
    const existingUnits = Array.isArray(propertyData.units) ? [...propertyData.units] : [];

    let criadas = 0;
    let atualizadas = 0;
    let erros = 0;
    const nowIso = new Date().toISOString();

    for (const u of unidades) {
      if (!u.chave_externa || typeof u.chave_externa !== 'string') {
        erros++;
        continue;
      }

      const idx = existingUnits.findIndex((eu) => eu.chave_externa === u.chave_externa);
      const existing = idx >= 0 ? existingUnits[idx] : null;

      const unitRecord = {
        id: existing ? existing.id : crypto.randomUUID(),
        empreendimento_id: propertyId,
        chave_externa: String(u.chave_externa).trim(),
        unidade: u.unidade !== undefined ? String(u.unidade).trim() : (existing?.unidade || ''),
        torre_bloco: u.torre_bloco !== undefined ? String(u.torre_bloco).trim() : (existing?.torre_bloco || ''),
        tipo: u.tipo !== undefined ? String(u.tipo).trim() : (existing?.tipo || 'Apartamento'),
        quartos: u.quartos !== undefined
          ? (u.quartos !== null ? Number(u.quartos) : null)
          : (existing?.quartos ?? null),
        suites: u.suites !== undefined
          ? (u.suites !== null ? Number(u.suites) : null)
          : (existing?.suites ?? null),
        banheiros: u.banheiros !== undefined
          ? (u.banheiros !== null ? Number(u.banheiros) : null)
          : (existing?.banheiros ?? null),
        posicao: u.posicao !== undefined
          ? (u.posicao !== null ? String(u.posicao).trim() : null)
          : (existing?.posicao ?? null),
        area_m2: u.area_m2 !== undefined
          ? (u.area_m2 !== null ? Number(u.area_m2) : null)
          : (existing?.area_m2 ?? null),
        metragem_texto: u.metragem_texto !== undefined
          ? (u.metragem_texto !== null ? String(u.metragem_texto).trim() : null)
          : (existing?.metragem_texto ?? (u.area_m2 ? `${u.area_m2}m²` : null)),
        preco: u.preco !== undefined
          ? (u.preco !== null ? Number(u.preco) : null)
          : (existing?.preco ?? null),
        sinal: u.sinal !== undefined
          ? (u.sinal !== null ? Number(u.sinal) : null)
          : (existing?.sinal ?? null),
        parcela: u.parcela !== undefined
          ? (u.parcela !== null ? Number(u.parcela) : null)
          : (existing?.parcela ?? null),
        status: u.status !== undefined
          ? (['disponivel', 'reservada', 'vendida'].includes(String(u.status).toLowerCase()) ? String(u.status).toLowerCase() : (existing?.status || 'disponivel'))
          : (existing?.status || 'disponivel'),
        atualizado_em: nowIso,
      };

      if (existing) {
        existingUnits[idx] = unitRecord;
        atualizadas++;
      } else {
        existingUnits.push(unitRecord);
        criadas++;
      }
    }

    propertyData.units = existingUnits;
    propertyData.updated_at = nowIso;

    const { error: updateErr } = await supabase
      .from('inventory_properties')
      .update({ property_data: propertyData, updated_at: nowIso })
      .eq('account_id', accountId)
      .eq('property_id', propertyId);

    if (updateErr) {
      throw new Error(`Falha ao persistir unidades: ${updateErr.message}`);
    }

    await logMcpAudit({
      tool: 'upsert_unidades_lote',
      affected_ids: [propertyId],
      payload: { total_unidades: unidades.length },
      result: { criadas, atualizadas, erros, total_atual: existingUnits.length },
    });

    return {
      empreendimento_id: propertyId,
      total_enviadas: unidades.length,
      criadas,
      atualizadas,
      erros,
      total_unidades: existingUnits.length,
    };
  });
}

/**
 * 9. marcar_unidades_status
 */
export async function marcarUnidadesStatus({
  empreendimento_id = null,
  chave_externa = null,
  chaves_externas = [],
  status = 'disponivel',
} = {}) {
  if (!Array.isArray(chaves_externas) || chaves_externas.length === 0) {
    throw new Error('Lista "chaves_externas" é obrigatória.');
  }

  const validStatus = ['disponivel', 'reservada', 'vendida'];
  const targetStatus = String(status).toLowerCase().trim();
  if (!validStatus.includes(targetStatus)) {
    throw new Error(`Status inválido "${status}". Use: ${validStatus.join(', ')}.`);
  }

  const supabase = getSupabaseClient();
  const accountId = getAccountId();

  const devRow = await findDevelopment(supabase, accountId, { id: empreendimento_id, chave_externa });
  if (!devRow) {
    throw new Error('Empreendimento não encontrado.');
  }

  const propertyId = devRow.property_id;
  const propertyData = devRow.property_data || {};
  const units = Array.isArray(propertyData.units) ? propertyData.units : [];
  const targetKeys = new Set(chaves_externas.map(String));
  const nowIso = new Date().toISOString();

  let atualizadas = 0;
  units.forEach((u) => {
    if (targetKeys.has(u.chave_externa)) {
      u.status = targetStatus;
      u.atualizado_em = nowIso;
      atualizadas++;
    }
  });

  propertyData.units = units;
  propertyData.updated_at = nowIso;

  await supabase
    .from('inventory_properties')
    .update({ property_data: propertyData, updated_at: nowIso })
    .eq('account_id', accountId)
    .eq('property_id', propertyId);

  await logMcpAudit({
    tool: 'marcar_unidades_status',
    affected_ids: [propertyId, ...chaves_externas],
    payload: { chaves_externas, status: targetStatus },
    result: { atualizadas },
  });

  return {
    empreendimento_id: propertyId,
    status: targetStatus,
    atualizadas,
    total_solicitadas: chaves_externas.length,
  };
}

/**
 * 10. desativar_empreendimento (soft delete)
 */
export async function desativarEmpreendimento({ id = null, chave_externa = null, motivo = 'Desativado via MCP' } = {}) {
  const supabase = getSupabaseClient();
  const accountId = getAccountId();

  const devRow = await findDevelopment(supabase, accountId, { id, chave_externa });
  if (!devRow) {
    throw new Error('Empreendimento não encontrado para desativação.');
  }

  const propertyId = devRow.property_id;
  const propertyData = devRow.property_data || {};
  const nowIso = new Date().toISOString();

  propertyData.ativo = false;
  propertyData.status = 'Arquivado';
  propertyData.desativado_motivo = String(motivo || 'Desativado via MCP').trim();
  propertyData.desativado_em = nowIso;
  propertyData.updated_at = nowIso;

  await supabase
    .from('inventory_properties')
    .update({ property_data: propertyData, updated_at: nowIso })
    .eq('account_id', accountId)
    .eq('property_id', propertyId);

  await logMcpAudit({
    tool: 'desativar_empreendimento',
    affected_ids: [propertyId],
    payload: { id: propertyId, motivo },
    result: { ativo: false, status: 'Arquivado' },
  });

  return {
    id: propertyId,
    chave_externa: propertyData.chave_externa || null,
    ativo: false,
    status: 'Arquivado',
    motivo: propertyData.desativado_motivo,
    desativado_em: nowIso,
  };
}
