import { existsSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const OFFICIAL_TEMPLATES = [
  {
    title: 'Mensagem 1 — Busca de cliente / Aceita corretor',
    content:
      'Olá, tudo joia? Estou buscando um apartamento para um cliente e encontrei o seu anúncio. Você aceita trabalhar com corretor caso o imóvel faça sentido para ele?',
  },
  {
    title: 'Mensagem 2 — Procura na região / Intermediação',
    content:
      'Oi, tudo joia? Estou com um cliente procurando apartamento nessa região e encontrei o seu anúncio. Se fizer sentido para ele, você aceita que eu faça a intermediação?',
  },
  {
    title: 'Mensagem 3 — Ajudando cliente / Perfil interessante',
    content:
      'Oi! Tudo certo? Estou ajudando um cliente na busca por um apartamento e achei o seu anúncio interessante para o perfil dele. Você trabalha com corretor caso ele queira conhecer?',
  },
  {
    title: 'Mensagem 4 — Apresentação de opção / Intermediação',
    content:
      'Oi! Tudo certo? Tenho um cliente procurando apartamento e achei que o seu pode ser uma boa opção para apresentar a ele. Se houver interesse, você aceita minha intermediação como corretor?',
  },
  {
    title: 'Mensagem 5 — Acompanhando busca / Apresentar imóvel',
    content:
      'Olá! Tudo jóia? Estou acompanhando a busca de um cliente e acabei chegando ao seu anúncio. Posso apresentar seu apartamento a ele?',
  },
];

async function main() {
  console.log('🔄 Sincronizando as 5 mensagens oficiais no Supabase...');

  // Busca contas cadastradas
  const { data: accounts, error: accErr } = await supabase.from('accounts').select('id, name');
  if (accErr) throw accErr;

  for (const acc of accounts) {
    console.log(`\n📌 Processando conta: ${acc.name || acc.id} (${acc.id})`);

    // Remove templates antigos de teste ou mock desta conta
    const { error: delErr } = await supabase
      .from('bot_message_templates')
      .delete()
      .eq('account_id', acc.id);
    if (delErr) console.warn('Aviso ao limpar templates antigos:', delErr.message);

    // Insere as 5 mensagens oficiais
    for (const t of OFFICIAL_TEMPLATES) {
      const { data, error } = await supabase
        .from('bot_message_templates')
        .insert({
          account_id: acc.id,
          title: t.title,
          content: t.content,
        })
        .select()
        .single();

      if (error) {
        console.error(`❌ Erro ao inserir "${t.title}":`, error.message);
      } else {
        console.log(`✅ Cadastrada: "${t.title}" (ID: ${data.id})`);
      }
    }
  }

  console.log('\n✨ Todas as 5 mensagens oficiais foram sincronizadas com sucesso!');
}

main().catch((err) => {
  console.error('Erro na execução:', err);
  process.exit(1);
});
