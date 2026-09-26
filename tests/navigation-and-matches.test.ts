import * as fs from 'fs';
import { getAllMatches, getMatchesForProperty } from '../src/lib/match/service';

function loadEnvFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const k = trimmed.slice(0, idx).trim();
        const v = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
        if (!process.env[k]) process.env[k] = v;
      }
    }
  }
}

loadEnvFile('.env');

console.log('======================================================');
console.log('TESTES DE REGRESSÃO: PERSISTÊNCIA DE ROTAS, F5 E MATCHES');
console.log('======================================================\n');

let passed = 0;
let failed = 0;

function assert(condition: boolean, title: string, detail?: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ [TEST ${passed + failed}] ${title}`);
    if (detail) console.log(`      ↳ ${detail}`);
  } else {
    failed++;
    console.error(`  ✗ [TEST ${passed + failed}] FALHA: ${title}`);
    if (detail) console.error(`      ↳ ${detail}`);
  }
}

// 1. Mapeamento de Rotas no App.tsx
const appSource = fs.readFileSync('src/App.tsx', 'utf8');

const hasRoutePersistence =
  appSource.includes('SECTION_TO_PATH') &&
  appSource.includes('PATH_TO_SECTION') &&
  appSource.includes('getSectionFromPathname');

assert(hasRoutePersistence, '1. Mapeamento bidirecional de rotas existe no App.tsx', 'SECTION_TO_PATH e PATH_TO_SECTION declarados');

// 2. F5 e Refresh em /match
const resolvesMatch =
  appSource.includes("'/match': 'match'") &&
  appSource.includes("match: '/match'");
assert(resolvesMatch, '2. Rota /match mapeada para seção match (F5 preserva tela)', 'Path /match -> section match');

// 3. F5 e Refresh em /estoque
const resolvesEstoque =
  appSource.includes("'/estoque': 'estoque'") &&
  appSource.includes("estoque: '/estoque'");
assert(resolvesEstoque, '3. Rota /estoque mapeada para seção estoque (F5 preserva tela)', 'Path /estoque -> section estoque');

// 4. F5 e Refresh em /calendario
const resolvesCalendario =
  appSource.includes("'/calendario': 'calendario'") &&
  appSource.includes("calendario: '/calendario'");
assert(resolvesCalendario, '4. Rota /calendario mapeada para seção calendario (F5 preserva tela)', 'Path /calendario -> section calendario');

// 5. Suporte a todas as seções principais
const sections = [
  'dashboard',
  'estoque',
  'match',
  'adicionar-imovel',
  'piloto-automatico',
  'calendario',
  'parceiros',
  'arquivados',
  'relatorios',
  'configuracoes',
];
const allSectionsMapped = sections.every(
  (sec) => appSource.includes(`'/${sec}'`) || appSource.includes(`/${sec}`)
);
assert(allSectionsMapped, '5. Todas as 10 seções possuem rotas persistentes', sections.join(', '));

// 6. Popstate / Back / Forward ativo
const hasPopstate =
  appSource.includes("window.addEventListener('popstate'") &&
  appSource.includes('window.history.pushState');
assert(hasPopstate, '6. Navegação via History API (pushState e popstate) implementada', 'Permite navegação Back/Forward do navegador');

// 7. Vercel SPA Fallback e preservação de rotas públicas
const vercelConfig = JSON.parse(fs.readFileSync('vercel.json', 'utf8'));
const hasSpaFallback = vercelConfig.rewrites.some(
  (r: any) => r.source === '/(.*)' && r.destination === '/index.html'
);
const preservesPublicPage = vercelConfig.rewrites.some(
  (r: any) => r.source === '/imoveis/p/:token'
);
assert(hasSpaFallback && preservesPublicPage, '7. vercel.json entrega SPA para deep links sem quebrar /imoveis/p/:token', 'Rewrite wildcard e /imoveis/p/:token preservados');

// 8. Consumo de Matches do Banco Compartilhado
async function testMatchConsumption() {
  const matches = await getAllMatches({ status: 'novo', minScore: 50 });
  assert(matches.length === 42, '8. Exatamente 42 relacionamentos Lead ↔ Imóvel retornados do banco', `Retornados: ${matches.length}`);

  const t1 = matches.filter((m) => m.lead?.name === 'TESTE 1');
  const t2 = matches.filter((m) => m.lead?.name === 'TESTE 2');

  assert(t1.length === 21, '9. TESTE 1 possui exatamente 21 matches no Meus Imóveis', `Contagem: ${t1.length}`);
  assert(t2.length === 21, '10. TESTE 2 possui exatamente 21 matches no Meus Imóveis', `Contagem: ${t2.length}`);

  const t1Best = Math.max(...t1.map((m) => m.matchScore));
  const t2Best = Math.max(...t2.map((m) => m.matchScore));
  assert(t1Best === 100, '11. Melhor match do TESTE 1 é exatamente 100%', `Melhor score: ${t1Best}%`);
  assert(t2Best === 69, '12. Melhor match do TESTE 2 é exatamente 69%', `Melhor score: ${t2Best}%`);

  const t1Sunset = t1.find((m) => m.matchScore === 100);
  assert(
    t1Sunset?.property?.title === 'Edifício Royal Sunset',
    '13. TESTE 1 com 100% está associado ao Edifício Royal Sunset',
    `Imóvel: ${t1Sunset?.property?.title}`
  );

  const t2_69 = t2.filter((m) => m.matchScore === 69);
  assert(
    t2_69.length > 0,
    '14. TESTE 2 com 69% está associado aos imóveis correspondentes',
    `Exemplo: ${t2_69[0]?.property?.title}`
  );

  const anySuppressed = matches.some((m) => m.suppressed);
  assert(!anySuppressed, '15. Nenhum match suprimido é retornado', 'suppressed = false respeitado');

  console.log('\n======================================================');
  console.log(`RESULTADO: ${passed} PASSARAM | ${failed} FALHARAM`);
  console.log('======================================================\n');

  if (failed > 0) process.exit(1);
}

testMatchConsumption().catch((err) => {
  console.error('Erro na validação do consumo de matches:', err);
  process.exit(1);
});
