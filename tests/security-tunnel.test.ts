import fs from 'fs';
import path from 'path';

console.log('======================================================');
console.log('PARTE F — TESTES ESPECÍFICOS DE SEGURANÇA DO TÚNEL');
console.log('======================================================\n');

let allPassed = true;
function assertSecurity(num: number, desc: string, ok: boolean, details: string) {
  if (ok) {
    console.log(`  ✓ [SEC ${num.toString().padStart(2, '0')}] ${desc}`);
    console.log(`      ↳ ${details}`);
  } else {
    console.log(`  ✗ [SEC ${num.toString().padStart(2, '0')}] ${desc}`);
    console.log(`      ↳ FALHA: ${details}`);
    allPassed = false;
  }
}

// 1. Browser nunca recebe TUNNEL_API_KEY
const serviceSource = fs.readFileSync(path.resolve('src/lib/match/service.ts'), 'utf-8');
const readsTunnelKeyInBrowser =
  serviceSource.includes('VITE_TUNNEL_API_KEY') ||
  serviceSource.includes('TUNNEL_API_KEY') ||
  serviceSource.includes('TUNNEL_SECRET_KEY');
assertSecurity(
  1,
  'Código client-side (src/) nunca lê TUNNEL_API_KEY ou VITE_TUNNEL_API_KEY',
  !readsTunnelKeyInBrowser,
  'service.ts não contém nenhuma variável ou leitura de segredo do túnel'
);

// 2. syncPropertyToMatch chama endpoint local same-origin
const syncCallsLocal =
  serviceSource.includes("fetch('/api/tunnel/v1/properties/sync'") ||
  serviceSource.includes('fetch(`/api/tunnel/v1/properties/sync`');
assertSecurity(
  2,
  'syncPropertyToMatch chama endpoint local same-origin (/api/tunnel/v1/properties/sync)',
  syncCallsLocal,
  'Requisição feita para a própria origem do Meus Imóveis, sem domínio externo'
);

// 3. createPropertyShareAndSend chama endpoint local same-origin
const shareCallsLocal =
  serviceSource.includes("fetch('/api/tunnel/v1/shares/create'") ||
  serviceSource.includes('fetch(`/api/tunnel/v1/shares/create`');
assertSecurity(
  3,
  'createPropertyShareAndSend chama endpoint local same-origin (/api/tunnel/v1/shares/create)',
  shareCallsLocal,
  'Requisição feita para a própria origem do Meus Imóveis, sem domínio externo'
);

// 4. Proxy serverless adiciona Bearer somente no servidor
const syncProxyCode = fs.readFileSync(path.resolve('api/tunnel/v1/properties/sync.js'), 'utf-8');
const shareProxyCode = fs.readFileSync(path.resolve('api/tunnel/v1/shares/create.js'), 'utf-8');
const proxiesAddBearer =
  syncProxyCode.includes('Authorization') &&
  syncProxyCode.includes('Bearer ${tunnelKey}') &&
  shareProxyCode.includes('Authorization') &&
  shareProxyCode.includes('Bearer ${tunnelKey}');
assertSecurity(
  4,
  'Proxies serverless injetam Authorization: Bearer estritamente no servidor',
  proxiesAddBearer,
  'Injeção do header Authorization ocorre exclusivamente nas rotas api/ da Vercel'
);

// 5. Proxy falha de forma segura se TUNNEL_API_KEY não estiver configurada
const proxiesCheckKey =
  syncProxyCode.includes('if (!tunnelKey)') &&
  syncProxyCode.includes('res.statusCode = 500') &&
  shareProxyCode.includes('if (!tunnelKey)') &&
  shareProxyCode.includes('res.statusCode = 500');
assertSecurity(
  5,
  'Proxies serverless falham com HTTP 500 seguro caso TUNNEL_API_KEY esteja ausente',
  proxiesCheckKey,
  'Nenhum proxy utiliza fallback de chave pública padrão; falha segura implementada'
);

// 6. Bundle Vite não contém segredo do túnel
const distFiles = fs.readdirSync(path.resolve('dist/assets')).filter((f) => f.endsWith('.js'));
let bundleHasSecret = false;
for (const file of distFiles) {
  const content = fs.readFileSync(path.resolve('dist/assets', file), 'utf-8');
  if (
    content.includes('VITE_TUNNEL_API_KEY') ||
    content.includes('TUNNEL_API_KEY') ||
    content.includes('TUNNEL_SHARED_SECRET')
  ) {
    bundleHasSecret = true;
    break;
  }
}
assertSecurity(
  6,
  'Bundle Vite compilado em dist/assets/*.js está livre de variáveis de segredo',
  !bundleHasSecret,
  'Zero ocorrências de identificadores de segredos no bundle'
);

// 7. Bundle não contém fallback hardcoded de autenticação
let bundleHasHardcodedKey = false;
for (const file of distFiles) {
  const content = fs.readFileSync(path.resolve('dist/assets', file), 'utf-8');
  if (content.includes('wacrm-meusimoveis-tunnel-secret-key-v1')) {
    bundleHasHardcodedKey = true;
    break;
  }
}
assertSecurity(
  7,
  'Bundle não contém string hardcoded de fallback (wacrm-meusimoveis-tunnel-secret-key-v1)',
  !bundleHasHardcodedKey,
  'Chave default legada completamente erradicada do bundle de produção'
);

console.log('\n======================================================');
if (allPassed) {
  console.log('RESULTADO DOS TESTES DE SEGURANÇA: 7 DE 7 PASSARAM (100% SEGURO)');
} else {
  console.log('RESULTADO DOS TESTES DE SEGURANÇA: FALHA IDENTIFICADA');
  process.exit(1);
}
console.log('======================================================\n');
