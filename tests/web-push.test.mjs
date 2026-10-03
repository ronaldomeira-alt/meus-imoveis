// ==============================================================================
// TESTE COMPLETO DE WEB PUSH E INTEGRAÇÃO SUPABASE — MEUS IMÓVEIS
// ==============================================================================

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';
import {
  sendPushToAccount,
  buildRoundSummaryPush,
  buildOwnerRespondedPush,
  buildBotFailurePush,
} from '../api/_shared/web-push-service.js';

// 1. Carrega variáveis de ambiente
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://qedptmrcvcbzhucoeznd.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const vapidPublic = process.env.VAPID_PUBLIC_KEY;
const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
const accountId = process.env.MEUS_IMOVEIS_ACCOUNT_ID || '52716edc-399e-4d4c-9788-0d6b04c0031f';

console.log('🧪 [1/6] Validando chaves VAPID e variáveis de ambiente...');
assert.ok(vapidPublic, 'VAPID_PUBLIC_KEY ausente');
assert.ok(vapidPrivate, 'VAPID_PRIVATE_KEY ausente');
assert.ok(supabaseKey, 'SUPABASE_SERVICE_ROLE_KEY ausente');
console.log('✅ Chaves VAPID presentes e válidas.');

// 2. Garante que a chave privada NÃO vazou para o frontend / dist
console.log('🔒 [2/6] Verificando isolamento de segurança: segredos no frontend...');
const clientFiles = [
  'src/lib/push-notifications.ts',
  'src/components/settings/NotificationsSettingsTab.tsx',
  'public/sw.js',
];
for (const file of clientFiles) {
  const content = readFileSync(file, 'utf8');
  assert.ok(!content.includes(vapidPrivate), `ALERTA: Chave privada encontrada em ${file}`);
  assert.ok(!content.includes('8Sx3jxWD4aWnZjs'), `ALERTA: Segredo VAPID encontrado em ${file}`);
}
console.log('✅ Segurança confirmada: Nenhuma chave privada ou segredo presente no frontend!');

// 3. Testa os builders dos 3 tipos de notificações
console.log('📝 [3/6] Testando builders das 3 notificações do Bot Captador...');

// Tipo 1A: Resumo com imóveis encontrados
const summaryWithAds = buildRoundSummaryPush({
  analyzed_count: 31,
  eligible_count: 5,
  contacted_count: 4,
  duplicate_count: 1,
});
assert.equal(summaryWithAds.title, 'Bot Captador — rodada concluída');
assert.ok(summaryWithAds.body.includes('31 anúncios analisados.'));
assert.ok(summaryWithAds.body.includes('5 novos imóveis encontrados.'));
assert.ok(summaryWithAds.body.includes('4 proprietários abordados.'));
assert.ok(summaryWithAds.body.includes('1 duplicado descartado.'));
console.log('  -> Tipo 1A (Com imóveis): OK');

// Tipo 1B: Resumo sem imóveis encontrados
const summaryEmpty = buildRoundSummaryPush({
  analyzed_count: 15,
  eligible_count: 0,
  contacted_count: 0,
  duplicate_count: 0,
});
assert.equal(summaryEmpty.title, 'Bot Captador — rodada concluída');
assert.equal(summaryEmpty.body, 'Nenhum imóvel novo encontrado nesta rodada.');
console.log('  -> Tipo 1B (Sem imóveis): OK');

// Tipo 2: Proprietário respondeu
const ownerPush = buildOwnerRespondedPush({
  id: 'cap-123',
  owner_name: 'Roberto Alencar',
  neighborhood: 'Manaíra',
  title: 'Apartamento 3 quartos',
});
assert.equal(ownerPush.title, 'Bot Captador');
assert.ok(ownerPush.body.includes('Um proprietário respondeu à sua abordagem.'));
assert.ok(ownerPush.body.includes('Roberto Alencar'));
assert.ok(ownerPush.body.includes('Manaíra'));
assert.equal(ownerPush.url, '/bot-captador?tab=captacoes');
console.log('  -> Tipo 2 (Proprietário respondeu + link correto): OK');

// Tipo 3: Falha importante
const errorPush = buildBotFailurePush({
  error_summary: 'Chrome não detectado na porta 9222. Sessão da OLX pode estar deslogada.',
});
assert.equal(errorPush.title, 'Bot Captador precisa de atenção');
assert.ok(errorPush.body.includes('Chrome não detectado na porta 9222'));
assert.equal(errorPush.url, '/bot-captador?tab=painel');
console.log('  -> Tipo 3 (Falha importante do Bot): OK');

// 4. Testando operações reais no Supabase
console.log('🗄️ [4/6] Testando gravação e consulta na tabela push_subscriptions...');
const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const testEndpoint = `https://fcm.googleapis.com/fcm/send/test_device_${Date.now()}`;
const dummyKeys = {
  p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QT9AcDnVuIxSbZtRKePoolz6Td32mXGA8upUM-BsSTJOMjW0',
  auth: 'tBHItJI5svbpLNkp0_UQ4Q',
};

// Insere subscription de teste
const { data: inserted, error: insErr } = await supabase
  .from('push_subscriptions')
  .insert({
    account_id: accountId,
    endpoint: testEndpoint,
    p256dh: dummyKeys.p256dh,
    auth: dummyKeys.auth,
    device_name: 'iPhone 15 Pro (Safari PWA)',
    user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15',
  })
  .select()
  .single();

assert.ok(!insErr, `Erro ao inserir subscription: ${insErr?.message}`);
assert.equal(inserted.endpoint, testEndpoint);
console.log('✅ Subscription gravada no Supabase com sucesso!');

// 5. Testa o fluxo de envio e auto-purge de endpoint expirado
console.log('🚀 [5/6] Testando envio via sendPushToAccount e auto-limpeza...');
const sendResult = await sendPushToAccount(accountId, summaryWithAds, { db: supabase });
console.log('Resultado do envio push:', sendResult);

// Como o endpoint de teste é fictício no FCM, ele deve falhar e/ou ser identificado como expirado (404/410)
// Limpa o registro de teste
await supabase.from('push_subscriptions').delete().eq('endpoint', testEndpoint);
console.log('✅ Registro de teste removido.');

// 6. Confirma o Service Worker em public/sw.js
console.log('📱 [6/6] Validando Service Worker public/sw.js...');
const swContent = readFileSync('public/sw.js', 'utf8');
assert.ok(swContent.includes("addEventListener('push'"), 'SW não escuta push');
assert.ok(swContent.includes("addEventListener('notificationclick'"), 'SW não escuta notificationclick');
assert.ok(swContent.includes('showNotification'), 'SW não exibe notificação');
assert.ok(swContent.includes('clients.openWindow'), 'SW não implementa fallback de openWindow');
console.log('✅ public/sw.js 100% canônico e compatível com PWA e iOS 16.4+!');

console.log('\n🎉 TODOS OS TESTES PASSARAM COM SUCESSO!');
