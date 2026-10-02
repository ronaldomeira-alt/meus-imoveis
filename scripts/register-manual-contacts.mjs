// ==============================================================================
// REGISTRO DE CONTATOS MANUAIS DO CORRETOR (Tombstones Perpétuos e Histórico)
// ==============================================================================

import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Credenciais do Supabase não configuradas no .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const adsToRegister = [
  // Venda (4 anúncios)
  { external_id: '1536488436', campaign_type: 'venda', title: 'Anúncio OLX 1536488436 (Venda)' },
  { external_id: '1523994645', campaign_type: 'venda', title: 'Anúncio OLX 1523994645 (Venda)' },
  { external_id: '1528897285', campaign_type: 'venda', title: 'Anúncio OLX 1528897285 (Venda)' },
  { external_id: '1539301848', campaign_type: 'venda', title: 'Anúncio OLX 1539301848 (Venda)' },
  // Aluguel (5 anúncios)
  { external_id: '1538452756', campaign_type: 'locacao', title: 'Anúncio OLX 1538452756 (Aluguel)' },
  { external_id: '1532219277', campaign_type: 'locacao', title: 'Anúncio OLX 1532219277 (Aluguel)' },
  { external_id: '1530052068', campaign_type: 'locacao', title: 'Anúncio OLX 1530052068 (Aluguel)' },
  { external_id: '1527797114', campaign_type: 'locacao', title: 'Anúncio OLX 1527797114 (Aluguel)' },
  { external_id: '1540164844', campaign_type: 'locacao', title: 'Anúncio OLX 1540164844 (Aluguel)' },
];

async function seed() {
  const { data: accounts, error: accErr } = await supabase.from('accounts').select('id, name');
  if (accErr) {
    console.error('Erro ao buscar contas:', accErr.message);
    process.exit(1);
  }

  console.log(`📡 Processando ${accounts.length} contas cadastradas no sistema...`);

  for (const acc of accounts) {
    console.log(`\n🏢 Conta: ${acc.name || acc.id} (${acc.id})`);

    for (const ad of adsToRegister) {
      const url = `https://pb.olx.com.br/imoveis/${ad.campaign_type === 'venda' ? 'venda' : 'aluguel'}-${ad.external_id}`;
      const fingerprint = `manual_contact_${ad.campaign_type}_${ad.external_id}`;
      const contactedAt = new Date().toISOString();

      // 1. Inserir Tombstone Perpétuo (Bloqueio Definitivo)
      const { error: tErr } = await supabase
        .from('bot_capture_tombstones')
        .upsert(
          {
            account_id: acc.id,
            fingerprint,
            normalized_url: url,
            external_id: ad.external_id,
            first_contacted_at: contactedAt,
          },
          { onConflict: 'account_id, fingerprint' }
        );

      if (tErr) {
        console.error(`  ❌ Erro tombstone ${ad.external_id}:`, tErr.message);
      } else {
        console.log(`  🔒 Tombstone perpétuo ativado: ${ad.external_id} (${ad.campaign_type})`);
      }

      // 2. Inserir em bot_captures (Histórico na interface)
      const { error: cErr } = await supabase
        .from('bot_captures')
        .upsert(
          {
            account_id: acc.id,
            campaign_type: ad.campaign_type,
            provider: 'olx',
            external_id: ad.external_id,
            url,
            normalized_url: url,
            fingerprint,
            title: ad.title,
            status: 'WAITING_RESPONSE',
            contacted_at: contactedAt,
            rejection_reason: 'Contatado previamente pelo corretor. Bloqueio permanente de recontato.',
            message_sent_snapshot: 'Abordagem realizada manualmente pelo usuário antes da ativação do Bot Captador.',
          },
          { onConflict: 'account_id, normalized_url' }
        );

      if (cErr) {
        console.error(`  ❌ Erro captura ${ad.external_id}:`, cErr.message);
      } else {
        console.log(`  📋 Captura registrada no histórico: ${ad.external_id} (${ad.campaign_type})`);
      }
    }
  }

  console.log('\n✅ Todos os 9 anúncios foram registrados e bloqueados para recontato com sucesso!');
}

seed().catch((err) => {
  console.error('Falha geral na execução:', err);
  process.exit(1);
});
