// ==============================================================================
// Teste de Integração Real com Banco Supabase — Módulo Bot Captador
// ==============================================================================

import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.log('⚠️ Variáveis de ambiente Supabase ausentes. Pulando teste de integração.');
  process.exit(0);
}

const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

console.log('🧪 Iniciando testes de banco de dados (RPCs e Atomicidade)...');

async function runDbTests() {
  // 1. Obter uma conta para teste
  const { data: accounts, error: accErr } = await supabase.from('accounts').select('id').limit(1);
  assert.ok(!accErr, accErr?.message);
  assert.ok(accounts && accounts.length > 0, 'Nenhuma conta encontrada');
  const accountId = accounts[0].id;

  // 2. Criar ou buscar template de mensagem
  const { data: tpl } = await supabase
    .from('bot_message_templates')
    .insert({
      account_id: accountId,
      title: 'Teste de Integração Automatizado',
      content: 'Mensagem de teste de abordagem atômica.',
    })
    .select()
    .single();

  assert.ok(tpl, 'Falha ao criar template de teste');
  const templateId = tpl.id;

  // 3. Inserir captação candidata na fila
  const testFp = `fp_test_integration_${Date.now()}`;
  const testUrl = `https://portal-imoveis.com.br/teste-${Date.now()}`;

  const { data: insertedCap, error: insErr } = await supabase
    .from('bot_captures')
    .insert({
      account_id: accountId,
      campaign_type: 'venda',
      provider: 'simulation',
      url: testUrl,
      normalized_url: testUrl,
      fingerprint: testFp,
      title: 'Apartamento Teste DB',
      price: 350000,
      neighborhood: 'Bessa',
      bedrooms: 2,
      area_m2: 60,
      status: 'QUEUED',
    })
    .select()
    .single();

  assert.ok(!insErr, insErr?.message);
  assert.ok(insertedCap, 'Falha ao enfileirar captação');
  console.log('✅ Captação inserida na fila com status QUEUED');

  // 4. Executar RPC de Reserva Atômica
  const { data: reservedList, error: resErr } = await supabase.rpc('reserve_next_bot_candidate', {
    p_account_id: accountId,
    p_campaign_type: 'venda',
    p_template_id: templateId,
  });

  assert.ok(!resErr, resErr?.message);
  assert.ok(reservedList && reservedList.length > 0, 'RPC não reservou candidato');
  const targetCandidateId = reservedList[0].capture_id;
  const targetFingerprint = reservedList[0].fingerprint;
  console.log('✅ RPC reserve_next_bot_candidate reservou atomicamente o candidato via FIFO');

  // 5. Executar Confirmação de Contato e Criação do Tombstone Perpétuo
  const { data: confirmOk, error: confErr } = await supabase.rpc('confirm_bot_capture_contacted', {
    p_capture_id: targetCandidateId,
    p_message_snapshot: 'Mensagem enviada com sucesso.',
  });

  assert.ok(!confErr, confErr?.message);
  assert.equal(confirmOk, true, 'Confirmação retornou falso');
  console.log('✅ RPC confirm_bot_capture_contacted transitou para WAITING_RESPONSE');

  // 6. Verificar se o Tombstone Perpétuo foi gravado
  const { data: tombstone } = await supabase
    .from('bot_capture_tombstones')
    .select('*')
    .eq('account_id', accountId)
    .eq('fingerprint', targetFingerprint)
    .maybeSingle();

  assert.ok(tombstone, 'Tombstone perpétuo não foi criado!');
  console.log('✅ Tombstone perpétuo gravado com sucesso no banco!');

  // 7. Simular tentativa de segunda reserva com mesmo fingerprint (Garantia de UMA ÚNICA ABORDAGEM)
  const { data: secondReserve } = await supabase.rpc('reserve_next_bot_candidate', {
    p_account_id: accountId,
    p_campaign_type: 'venda',
    p_template_id: templateId,
  });

  const duplicateReserved = (secondReserve || []).some((r) => r.fingerprint === testFp);
  assert.equal(duplicateReserved, false, 'VIOLAÇÃO: O mesmo imóvel foi reservado uma segunda vez!');
  console.log('✅ Garantia Absoluta: Nenhuma segunda abordagem possível para o mesmo fingerprint');

  // Limpeza do teste
  await supabase.from('bot_captures').delete().eq('id', insertedCap.id);
  await supabase.from('bot_capture_tombstones').delete().eq('fingerprint', testFp);
  await supabase.from('bot_message_templates').delete().eq('id', templateId);

  console.log('\n🎉 Teste de integração do banco de dados concluído com 100% de sucesso!');
}

runDbTests().catch((err) => {
  console.error('❌ Falha no teste de banco:', err);
  process.exit(1);
});
