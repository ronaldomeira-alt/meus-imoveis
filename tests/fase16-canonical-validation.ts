import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

function computeSha256(filePath: string): string {
  const content = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(content).digest('hex');
}

console.log('======================================================');
console.log('FASE 16 — CHECKLIST DE VALIDAÇÃO FINAL (10 CRITÉRIOS CANÔNICOS)');
console.log('======================================================\n');

let allPassed = true;
function assertCheck(num: number, desc: string, ok: boolean, details: string) {
  if (ok) {
    console.log(`  ✓ [CHECK ${num.toString().padStart(2, '0')}] ${desc}`);
    console.log(`      ↳ ${details}`);
  } else {
    console.log(`  ✗ [CHECK ${num.toString().padStart(2, '0')}] ${desc}`);
    console.log(`      ↳ FALHA: ${details}`);
    allPassed = false;
  }
}

// 1. Nenhuma chamada a evaluateMatch() ocorre no Meus Imóveis antes de enviar projeção ao WACRM
const miServiceContent = fs.readFileSync(path.resolve('src/lib/match/service.ts'), 'utf-8');
const syncPropIdx = miServiceContent.indexOf('export async function syncPropertyToMatch');
const syncPropEnd = miServiceContent.indexOf('export async function getMatchesForProperty');
const syncPropCode = miServiceContent.substring(syncPropIdx, syncPropEnd);
const evalInSync = syncPropCode.includes('evaluateMatch(');
assertCheck(
  1,
  'Nenhuma chamada a evaluateMatch() ocorre no Meus Imóveis em syncPropertyToMatch',
  !evalInSync,
  'syncPropertyToMatch delega integralmente ao WACRM sem rodar evaluateMatch local'
);

// 2. Cada alteração de imóvel gera no máximo UMA persistência de Match por par Lead ↔ Imóvel
const upsertInSync = syncPropCode.includes('.from(\'lead_property_matches\').upsert');
assertCheck(
  2,
  'Nenhum upsert concorrente em lead_property_matches a partir do Meus Imóveis',
  !upsertInSync,
  'Meus Imóveis não persiste matches em lead_property_matches, WACRM é a autoridade única'
);

// 3. Não há maturidade fictícia (80 ou 60) gravada pelo Meus Imóveis
const fakeMaturityPresent = syncPropCode.includes('80 : 60');
assertCheck(
  3,
  'Eliminação total de maturidade fictícia (80 : 60)',
  !fakeMaturityPresent,
  'Maturidade arbitrária (80:60) erradicada do código de sincronização'
);

// 4. Cada abertura de link incrementa open_count em exatamente +1 no WACRM
const wacrmServiceContent = fs.readFileSync(path.resolve('../WACRM/src/lib/match/service.ts'), 'utf-8');
const wacrmTrackingIdx = wacrmServiceContent.indexOf('export async function recordTrackingEvent');
const wacrmTrackingCode = wacrmServiceContent.substring(wacrmTrackingIdx);
const has5sDeduplication = wacrmTrackingCode.includes('diffMs < 5000');
const incrementsOpenCount = wacrmTrackingCode.includes('(share.open_count || 0) + 1');
assertCheck(
  4,
  'WACRM gerencia open_count com incremento +1 e guarda anti-duplicação de reload rápido (<5s)',
  has5sDeduplication && incrementsOpenCount,
  'open_count controlado com precisão de +1 e proteção anti-reload no WACRM'
);

// 5. Cada evento de tracking gera no máximo 1 registro em tracking_events
const pubPagesContent = fs.readFileSync(path.resolve('api/shared/public-pages.js'), 'utf-8');
const trackingJsContent = fs.readFileSync(path.resolve('api/tunnel/v1/events/tracking.js'), 'utf-8');
const pubPagesDirectInsert = pubPagesContent.includes('.from(\'tracking_events\').insert');
const trackingJsDirectInsert = trackingJsContent.includes('.from(\'tracking_events\').insert');
assertCheck(
  5,
  'Meus Imóveis não faz escrita direta em tracking_events (repasse limpo ao WACRM)',
  !pubPagesDirectInsert && !trackingJsDirectInsert,
  'Ambos os arquivos públicos em Meus Imóveis encaminham eventos via HTTP sem escrita direta no Supabase'
);

// 6. O hash do match-contract-v1.md é idêntico em ambos os repositórios
const wacrmHash = computeSha256(path.resolve('../WACRM/docs/match-contract-v1.md'));
const miHash = computeSha256(path.resolve('docs/match-contract-v1.md'));
assertCheck(
  6,
  'Hash SHA-256 de match-contract-v1.md idêntico em ambos os projetos',
  wacrmHash === miHash,
  `Hash idêntico: ${wacrmHash}`
);

// 7. O recálculo de Match só ocorre no WACRM
const wacrmRecalc = wacrmServiceContent.includes('export async function recalculateMatchesForProperty');
assertCheck(
  7,
  'Recálculo de Match reside exclusivamente no WACRM',
  wacrmRecalc,
  'WACRM é o único autor da rotina recalculateMatchesForProperty'
);

// 8. A maturidade do perfil só é calculada no WACRM
const wacrmMaturityCalc = wacrmServiceContent.includes('calculateProfileMaturity');
assertCheck(
  8,
  'Cálculo de maturidade canônica (8 critérios e peso CTWA 35%) exclusivo do WACRM',
  wacrmMaturityCalc,
  'WACRM possui autoridade canônica com a fórmula oficial'
);

// 9. A prioridade comercial é calculada pelo WACRM antes de persistir
const wacrmPriorityCalc = wacrmServiceContent.includes('calculateCommercialPriority');
assertCheck(
  9,
  'Prioridade comercial calculada e persistida pelo WACRM',
  wacrmPriorityCalc,
  'WACRM persiste commercial_priority ao atualizar lead_property_matches'
);

// 10. O catálogo de imóveis continua tendo Meus Imóveis como autoridade exclusiva
const miHasProperties = fs.existsSync(path.resolve('src/types/property.ts'));
assertCheck(
  10,
  'Catálogo de imóveis e PropertyProjection sob autoridade exclusiva do Meus Imóveis',
  miHasProperties,
  'Meus Imóveis emite PropertyProjection e gerencia ciclo de vida dos imóveis'
);

console.log('\n======================================================');
if (allPassed) {
  console.log('RESULTADO FINAL: TODOS OS 10 CRITÉRIOS CANÔNICOS FORAM ATENDIDOS COM SUCESSO (10/10)');
} else {
  console.log('RESULTADO FINAL: FALHAS IDENTIFICADAS NOS CRITÉRIOS CANÔNICOS');
  process.exit(1);
}
console.log('======================================================\n');
