import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const accountId = (process.env.MEUS_IMOVEIS_ACCOUNT_ID || process.env.MATCH_CANONICAL_ACCOUNT_ID || '').trim();

if (!supabaseUrl || !supabaseKey || !accountId) {
  console.error('Configuração Supabase incompleta.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function normalizeText(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function mapStatusToEnum(stageOrStatus) {
  if (!stageOrStatus) return null;
  const clean = normalizeText(stageOrStatus).replace(/[\s-]+/g, '_');
  if (clean.includes('lancamento') && (clean.includes('pre') || clean.includes('breve'))) return 'pre_lancamento';
  if (clean.includes('pre_lancamento') || clean.includes('prelancamento')) return 'pre_lancamento';
  if (clean.includes('lancamento')) return 'lancamento';
  if (clean.includes('construcao') || clean.includes('obra')) return 'em_construcao';
  if (clean.includes('pronto')) return 'pronto';
  return null;
}

function mapEnumToStage(statusEnum) {
  if (!statusEnum) return null;
  const clean = normalizeText(statusEnum).replace(/[\s-]+/g, '_');
  if (clean === 'pre_lancamento' || clean.includes('pre')) return 'Pré-lançamento';
  if (clean === 'lancamento') return 'Lançamento';
  if (clean === 'em_construcao' || clean.includes('construcao') || clean.includes('obra')) return 'Em construção';
  if (clean === 'pronto') return 'Pronto para morar';
  return null;
}

async function runMigration() {
  console.log('=== MIGRAÇÃO DE STATUS NO BANCO (inventory_properties) ===');
  console.log(`Account ID: ${accountId}`);

  const { data: rows, error } = await supabase
    .from('inventory_properties')
    .select('property_id, property_data, updated_at')
    .eq('account_id', accountId);

  if (error) {
    throw new Error(`Falha ao ler inventory_properties: ${error.message}`);
  }

  console.log(`Total de registros encontrados: ${rows.length}`);

  let arquivadoRestaurados = 0;
  let totalAtualizados = 0;
  const validEnums = new Set(['lancamento', 'em_construcao', 'pronto', 'pre_lancamento', null]);

  for (const row of rows) {
    const p = row.property_data || {};
    const oldStatus = p.status;
    const wasArquivado = oldStatus === 'Arquivado' || oldStatus === 'arquivado' || p.ativo === false;

    if (oldStatus === 'Arquivado' || oldStatus === 'arquivado') {
      arquivadoRestaurados++;
    }

    // Resolve a fase da obra histórica
    const resolvedEnum = (p.status_enum && mapStatusToEnum(p.status_enum))
      ?? (p.stage && mapStatusToEnum(p.stage))
      ?? (oldStatus !== 'Ativo' && oldStatus !== 'Arquivado' && oldStatus !== 'arquivado' ? mapStatusToEnum(oldStatus) : null)
      ?? null;

    if (!validEnums.has(resolvedEnum)) {
      console.warn(`[Atenção] Valor inesperado para ${row.property_id}:`, resolvedEnum);
    }

    const updatedData = {
      ...p,
      ativo: !wasArquivado,
      status: resolvedEnum, // Padronizado no enum ou null
      status_enum: resolvedEnum,
      stage: mapEnumToStage(resolvedEnum),
      desativado_motivo: wasArquivado ? (p.desativado_motivo || p.motivo_desativacao || 'Desativado via MCP') : null,
      motivo_desativacao: wasArquivado ? (p.desativado_motivo || p.motivo_desativacao || 'Desativado via MCP') : null,
      desativado_em: wasArquivado ? (p.desativado_em || row.updated_at || new Date().toISOString()) : null,
    };

    const { error: updateError } = await supabase
      .from('inventory_properties')
      .update({
        property_data: updatedData,
        updated_at: new Date().toISOString(),
      })
      .eq('account_id', accountId)
      .eq('property_id', row.property_id);

    if (updateError) {
      throw new Error(`Erro ao atualizar ${row.property_id}: ${updateError.message}`);
    }

    totalAtualizados++;
  }

  console.log(`\n✓ Migração concluída com sucesso!`);
  console.log(`- Total de registros atualizados: ${totalAtualizados}`);
  console.log(`- Registros com status 'Arquivado' restaurados para enum e ativo=false: ${arquivadoRestaurados}`);

  // Verificação pós-migração
  const { data: checkRows } = await supabase
    .from('inventory_properties')
    .select('property_id, property_data')
    .eq('account_id', accountId);

  const invalidStatuses = [];
  for (const r of checkRows) {
    const s = r.property_data?.status;
    if (!validEnums.has(s)) {
      invalidStatuses.push({ id: r.property_id, status: s });
    }
  }

  if (invalidStatuses.length > 0) {
    console.error('❌ ERRO: Registros fora do enum encontrados:', invalidStatuses);
    process.exit(1);
  } else {
    console.log('✓ VERIFICAÇÃO: 100% dos registros na base possuem status válido no enum (ou null)!');
  }
}

runMigration().catch((err) => {
  console.error('Erro na migração:', err);
  process.exit(1);
});
