import assert from 'node:assert';
import { handleMcpServer } from '../api/_shared/mcp-server.js';
import { buildPublicListing } from '../api/_shared/public-pages.js';
import { createCanvas } from '@napi-rs/canvas';
import { Readable } from 'node:stream';

const TEST_TOKEN = process.env.CRM_MCP_TOKEN || 'mcp_sec_7a9f82d4c01e68b31a54b9d0e12f';

function makeValidTestImage(index) {
  const canvas = createCanvas(400, 300);
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 400, 300);
  const colors = ['#1e40af', '#047857', '#b45309', '#b91c1c', '#6d28d9', '#0e7490', '#4338ca', '#c2410c'];
  grad.addColorStop(0, colors[index % colors.length]);
  grad.addColorStop(0.5, colors[(index + 3) % colors.length]);
  grad.addColorStop(1, '#f8fafc');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 400, 300);
  ctx.fillStyle = '#0f172a';
  ctx.font = '22px sans-serif';
  ctx.fillText(`Foto Teste #${index} - ${Date.now()}`, 30, 150);
  return `data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`;
}

function makeInvalidSmallPng() {
  const canvas = createCanvas(200, 150);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 200, 150);
  return `data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`;
}

function makeInvalidMonochromePng() {
  const canvas = createCanvas(400, 300);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#22c55e'; // verde sólido (std dev = 0)
  ctx.fillRect(0, 0, 400, 300);
  return `data:image/png;base64,${canvas.toBuffer('image/png').toString('base64')}`;
}

async function cleanupTestDev(chaveExterna, devId = null) {
  try {
    // 1. Desativa no MCP
    await rpcCall({
      method: 'tools/call',
      params: {
        name: 'desativar_empreendimento',
        arguments: {
          chave_externa: chaveExterna,
          motivo: 'Limpeza automática de teste',
        },
      },
    }).catch(() => null);

    // 2. Apaga arquivos do R2 e registros do banco
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const accountId = (process.env.MEUS_IMOVEIS_ACCOUNT_ID || process.env.MATCH_CANONICAL_ACCOUNT_ID || '').trim();
    if (!supabaseUrl || !supabaseKey || !accountId) return;

    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } });

    let targetId = devId;
    if (!targetId) {
      const { data: rows } = await supabase.from('inventory_properties').select('property_id, property_data').eq('account_id', accountId);
      const found = (rows || []).find((r) => r.property_data?.chave_externa === chaveExterna);
      targetId = found?.property_id;
    }

    if (targetId) {
      const r2AccountId = process.env.R2_ACCOUNT_ID;
      const r2AccessKeyId = process.env.R2_ACCESS_KEY_ID;
      const r2SecretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
      const r2Bucket = process.env.R2_BUCKET_NAME || 'rm-imoveis-media';
      if (r2AccountId && r2AccessKeyId && r2SecretAccessKey) {
        const { S3Client, ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');
        const s3 = new S3Client({
          region: 'auto',
          endpoint: `https://${r2AccountId}.r2.cloudflarestorage.com`,
          credentials: { accessKeyId: r2AccessKeyId, secretAccessKey: r2SecretAccessKey },
        });
        const prefix = `properties/${targetId}/`;
        const listRes = await s3.send(new ListObjectsV2Command({ Bucket: r2Bucket, Prefix: prefix })).catch(() => null);
        const objects = listRes?.Contents || [];
        if (objects.length > 0) {
          await s3.send(new DeleteObjectsCommand({
            Bucket: r2Bucket,
            Delete: { Objects: objects.map((obj) => ({ Key: obj.Key })), Quiet: true },
          })).catch(() => null);
        }
      }

      try {
        await supabase.from('property_media').delete().eq('property_id', targetId);
      } catch {}
      try {
        await supabase.from('inventory_property_tombstones').upsert({
          account_id: accountId,
          property_id: targetId,
          deleted_at: new Date().toISOString(),
        }, { onConflict: 'account_id,property_id' });
      } catch {}
      try {
        await supabase.from('inventory_properties').delete().eq('account_id', accountId).eq('property_id', targetId);
      } catch {}
    }
  } catch (err) {
    console.warn('[cleanupTestDev] Falha não-bloqueante na limpeza de teste:', err.message);
  }
}

async function rpcCall({ method, params = {}, token = TEST_TOKEN, id = 1 }) {
  const reqBody = JSON.stringify({ jsonrpc: '2.0', id, method, params });
  const reqStream = Readable.from([Buffer.from(reqBody)]);
  reqStream.method = 'POST';
  reqStream.url = '/api/mcp';
  reqStream.headers = {
    'content-type': 'application/json',
  };
  if (token) {
    reqStream.headers['authorization'] = `Bearer ${token}`;
  }

  let responseBody = '';
  const headers = {};
  const res = {
    statusCode: 200,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return headers[name.toLowerCase()];
    },
    writeHead(code, h = {}) {
      this.statusCode = code;
      Object.assign(headers, h);
    },
    end(chunk) {
      if (chunk) responseBody += chunk;
    },
  };

  await handleMcpServer(reqStream, res);

  return {
    status: res.statusCode,
    headers,
    json: responseBody ? JSON.parse(responseBody) : null,
  };
}

async function runMcpTests() {
  console.log('========================================================');
  console.log('TEST SUITE: SERVIDOR MCP MEUS IMÓVEIS (STREAMABLE HTTP)');
  console.log('========================================================\n');

  // 1. SEGURANÇA: Token ausente deve retornar 401
  console.log('[1] Testando autenticação Bearer...');
  const unauth = await rpcCall({ method: 'initialize', token: null });
  assert.strictEqual(unauth.status, 401, 'Requisição sem token deve retornar 401');
  assert(unauth.json.error, 'Deve retornar payload de erro JSON-RPC');
  console.log('  ✓ Bloqueio de requisições sem token: PASS');

  // 2. INICIALIZAÇÃO MCP: initialize
  console.log('[2] Testando handshake initialize...');
  const initRes = await rpcCall({
    method: 'initialize',
    params: { protocolVersion: '2024-11-05', clientInfo: { name: 'grokbot' } },
  });
  assert.strictEqual(initRes.status, 200);
  assert.strictEqual(initRes.json.result.serverInfo.name, 'meus-imoveis-mcp');
  assert.strictEqual(initRes.json.result.capabilities?.tools?.listChanged, true, 'capabilities.tools.listChanged deve ser true para invalidar cache de clientes MCP');
  console.log('  ✓ Handshake initialize com listChanged=true: PASS');

  // 3. LISTAGEM DE FERRAMENTAS: tools/list
  console.log('[3] Testando tools/list e validação estrita de JSON Schemas...');
  const toolsRes = await rpcCall({ method: 'tools/list' });
  assert.strictEqual(toolsRes.status, 200);
  assert(toolsRes.headers['Cache-Control']?.includes('no-store'), 'Deve conter Cache-Control no-store');
  assert(toolsRes.headers['CDN-Cache-Control'] === 'no-store', 'Deve conter CDN-Cache-Control no-store');

  // Testar alias list_tools
  const aliasRes = await rpcCall({ method: 'list_tools' });
  assert.strictEqual(aliasRes.status, 200);
  assert.strictEqual(aliasRes.json.result.tools.length, toolsRes.json.result.tools.length);

  const toolsList = toolsRes.json.result.tools;
  const toolNames = toolsList.map((t) => t.name);
  console.log(`  ✓ Ferramentas expostas (${toolNames.length}):`, toolNames.join(', '));
  assert(toolNames.includes('buscar_empreendimentos'));
  assert(toolNames.includes('obter_empreendimento'));
  assert(toolNames.includes('upsert_empreendimento'));
  assert(toolNames.includes('upsert_empreendimentos_lote'));
  assert(toolNames.includes('adicionar_foto'));
  assert(toolNames.includes('adicionar_fotos_lote'));
  assert(toolNames.includes('adicionar_foto_base64'));
  assert(toolNames.includes('listar_fotos'));
  assert(toolNames.includes('remover_foto'));
  assert(toolNames.includes('definir_capa'));
  assert(toolNames.includes('upsert_unidades_lote'));
  assert(toolNames.includes('marcar_unidades_status'));
  assert(toolNames.includes('desativar_empreendimento'));

  // Validação dos schemas declarados no tools/list
  const buscarTool = toolsList.find((t) => t.name === 'buscar_empreendimentos');
  assert(buscarTool.inputSchema.properties.incluir_internos, 'buscar_empreendimentos deve declarar parâmetro incluir_internos');
  assert(buscarTool.inputSchema.properties.incluir_testes, 'buscar_empreendimentos deve declarar parâmetro incluir_testes');

  const upsertTool = toolsList.find((t) => t.name === 'upsert_empreendimento');
  const upsertProps = upsertTool.inputSchema.properties;
  assert(upsertProps.origem, 'upsert_empreendimento deve declarar origem');
  assert(upsertProps.condicao, 'upsert_empreendimento deve declarar condicao');
  assert(upsertProps.nome_publico, 'upsert_empreendimento deve declarar nome_publico');
  assert(upsertProps.construtora, 'upsert_empreendimento deve declarar construtora');
  assert(upsertProps.contato_construtora, 'upsert_empreendimento deve declarar contato_construtora');
  assert(upsertProps.observacao_interna, 'upsert_empreendimento deve declarar observacao_interna');
  assert(upsertProps.endereco, 'upsert_empreendimento deve declarar endereco público');
  assert(upsertProps.endereco_completo, 'upsert_empreendimento deve declarar endereco_completo');
  assert(upsertProps.is_teste, 'upsert_empreendimento deve declarar is_teste');
  assert(Array.isArray(upsertProps.vagas.type) && upsertProps.vagas.type.includes('null'), 'vagas deve aceitar null');
  assert(Array.isArray(upsertProps.area_min_m2.type) && upsertProps.area_min_m2.type.includes('null'), 'area_min_m2 deve aceitar null');
  assert(Array.isArray(upsertProps.endereco_completo.type) && upsertProps.endereco_completo.type.includes('null'), 'endereco_completo deve aceitar null');

  const upsertLoteTool = toolsList.find((t) => t.name === 'upsert_empreendimentos_lote');
  const loteItemProps = upsertLoteTool.inputSchema.properties.itens.items.properties;
  assert(loteItemProps.origem, 'upsert_empreendimentos_lote deve declarar origem nos itens');
  assert(loteItemProps.condicao, 'upsert_empreendimentos_lote deve declarar condicao nos itens');
  assert(loteItemProps.nome_publico, 'upsert_empreendimentos_lote deve declarar nome_publico nos itens');
  assert(loteItemProps.construtora, 'upsert_empreendimentos_lote deve declarar construtora nos itens');
  assert(loteItemProps.contato_construtora, 'upsert_empreendimentos_lote deve declarar contato_construtora nos itens');
  assert(loteItemProps.observacao_interna, 'upsert_empreendimentos_lote deve declarar observacao_interna nos itens');
  assert(loteItemProps.endereco_completo, 'upsert_empreendimentos_lote deve declarar endereco_completo nos itens');
  assert(loteItemProps.is_teste, 'upsert_empreendimentos_lote deve declarar is_teste nos itens');

  const upsertUnidadesTool = toolsList.find((t) => t.name === 'upsert_unidades_lote');
  const unidadeItemProps = upsertUnidadesTool.inputSchema.properties.unidades.items.properties;
  assert(unidadeItemProps.posicao, 'upsert_unidades_lote deve declarar posicao');
  assert(unidadeItemProps.andar, 'upsert_unidades_lote deve declarar andar');
  assert(Array.isArray(unidadeItemProps.andar.type) && unidadeItemProps.andar.type.includes('null'), 'andar deve aceitar null');
  assert(unidadeItemProps.suites, 'upsert_unidades_lote deve declarar suites');
  assert(unidadeItemProps.banheiros, 'upsert_unidades_lote deve declarar banheiros');
  assert(Array.isArray(unidadeItemProps.banheiros.type) && unidadeItemProps.banheiros.type.includes('null'), 'banheiros deve aceitar null');
  assert(unidadeItemProps.vagas, 'upsert_unidades_lote deve declarar vagas');
  assert(Array.isArray(unidadeItemProps.vagas.type) && unidadeItemProps.vagas.type.includes('null'), 'vagas deve aceitar null');
  assert(unidadeItemProps.mobiliado, 'upsert_unidades_lote deve declarar mobiliado');
  assert(Array.isArray(unidadeItemProps.mobiliado.type) && unidadeItemProps.mobiliado.type.includes('null'), 'mobiliado deve aceitar null');

  const loteFotosTool = toolsList.find((t) => t.name === 'adicionar_fotos_lote');
  assert(loteFotosTool, 'adicionar_fotos_lote deve estar publicado no tools/list');
  assert(loteFotosTool.inputSchema.properties.fotos, 'adicionar_fotos_lote deve declarar parâmetro fotos');

  console.log('  ✓ Todas as ferramentas e JSON Schemas declarados com tipos anuláveis (null): PASS');

  const testChaveExterna = 'teste-antigravity';
  let createdDevId = null;

  // Garante estado limpo antes de iniciar
  await cleanupTestDev(testChaveExterna);

  try {
    // 4. CRIAR EMPREENDIMENTO COM ENDEREÇO PÚBLICO E COMPLETO DIFERENTES, E OBSERVAÇÃO PÚBLICA E INTERNA DIFERENTES
    console.log('\n[4] Testando criação com endereco ≠ endereco_completo e observacao ≠ observacao_interna...');
    const createCall = await rpcCall({
      method: 'tools/call',
      params: {
        name: 'upsert_empreendimento',
        arguments: {
          chave_externa: testChaveExterna,
          nome: 'Empreendimento Teste Antigravity',
          is_teste: true,
          // nome_publico omitido para testar fallback "Imóvel em <bairro>"
          construtora: 'Alliance Construtora',
          contato_construtora: '(83) 99999-8888 (Eng. Carlos)',
          bairro: 'Cabo Branco',
        cidade: 'João Pessoa',
        endereco: 'Cabo Branco, João Pessoa', // público
        endereco_completo: 'Av. Cabo Branco, 1800, Apt 301', // interno
        status: 'lancamento',
        entrega: '2027-12',
        preco_a_partir_de: 450000.0,
        area_min_m2: 32.5,
        area_max_m2: 95.0,
        quartos_min: 1,
        quartos_max: 3,
        // vagas omitido intencionalmente: deve permanecer NULL ("não informado"), nunca 0!
        observacao: 'Observação geral do condomínio.', // pública
        observacao_interna: 'Observação interna confidencial sobre negociação e comissão de 6%.', // interna
        descricao: 'Empreendimento de alto padrão beira-mar com rooftop e piscina de borda infinita.',
        diferenciais: ['Piscina na cobertura', 'Rooftop gourmet', 'Academia com vista para o mar'],
        link_tabela: 'https://docs.google.com/spreadsheets/d/tabela-exemplo',
        link_pasta: 'https://drive.google.com/drive/folders/pasta-exemplo',
        data_tabela: 'Outubro/2026',
        ativo: true,
      },
    },
  });

  if (createCall.json.result?.isError) {
    console.error('ERRO EM createCall:', createCall.json.result.content);
  }
  assert.strictEqual(createCall.status, 200);
  assert.strictEqual(createCall.json.result.isError, false);
  const createResult = JSON.parse(createCall.json.result.content[0].text);
  console.log('  ✓ Empreendimento criado com sucesso:', createResult);
  assert(createResult.id, 'Deve retornar ID interno');
  assert.strictEqual(createResult.criado, true, 'Deve marcar criado=true');
  assert.strictEqual(createResult.is_teste, true, 'is_teste deve ser true no retorno de upsert_empreendimento');
  createdDevId = createResult.id;

  // 4b. VERIFICAR QUE ENDEREÇO E OBSERVAÇÃO GRAVARAM E LERAM DIFERENTES
  console.log('\n[4b] Verificando se endereco ≠ endereco_completo e observacao ≠ observacao_interna...');
  const getDevCall = await rpcCall({
    method: 'tools/call',
    params: {
      name: 'obter_empreendimento',
      arguments: { chave_externa: testChaveExterna },
    },
  });
  const devData = JSON.parse(getDevCall.json.result.content[0].text);
  assert.strictEqual(devData.is_teste, true, 'is_teste deve ser true em obter_empreendimento');
  assert.strictEqual(devData.origem, 'construtora', 'Origem padrão deve ser "construtora"');
  assert.strictEqual(devData.condicao, 'novo', 'Condição padrão para construtora deve ser "novo"');
  assert.strictEqual(devData.vagas, null, 'Vagas omitido deve ser estritamente null (nunca 0)');
  assert.strictEqual(devData.interno?.construtora, 'Alliance Construtora');
  assert.strictEqual(devData.interno?.contato_construtora, '(83) 99999-8888 (Eng. Carlos)');
  assert.strictEqual(devData.endereco, 'Cabo Branco, João Pessoa', 'Endereco público deve ser só bairro/cidade');
  assert.strictEqual(devData.interno?.endereco_completo, 'Av. Cabo Branco, 1800, Apt 301', 'Endereco completo interno deve conter rua/número');
  assert.notStrictEqual(devData.endereco, devData.interno?.endereco_completo, 'endereco e endereco_completo devem ser diferentes');
  assert.strictEqual(devData.observacao, 'Observação geral do condomínio.', 'observacao pública deve ser independente');
  assert.strictEqual(devData.interno?.observacao_interna, 'Observação interna confidencial sobre negociação e comissão de 6%.');
  assert.notStrictEqual(devData.observacao, devData.interno?.observacao_interna, 'observacao e observacao_interna devem ser diferentes');
  assert.strictEqual(devData.nome_publico, null, 'nome_publico deve ser estritamente null quando omitido');
  console.log('  ✓ endereco ≠ endereco_completo, objeto interno, observacao ≠ observacao_interna e nome_publico null: PASS');

  // 4c. TESTE CRÍTICO: UPSERT COM MERGE (enviando SÓ descricao -> todos os outros campos continuam iguais)
  console.log('\n[4c] Testando UPSERT COM MERGE estrito (enviando APENAS descricao)...');
  const mergeCall = await rpcCall({
    method: 'tools/call',
    params: {
      name: 'upsert_empreendimento',
      arguments: {
        chave_externa: testChaveExterna,
        descricao: 'Descrição atualizada mantendo endereço, entrega, links e status intactos.',
      },
    },
  });
  assert.strictEqual(mergeCall.status, 200);
  assert.strictEqual(mergeCall.json.result.isError, false);
  const mergeResult = JSON.parse(mergeCall.json.result.content[0].text);
  assert.strictEqual(mergeResult.id, createdDevId);
  assert.strictEqual(mergeResult.criado, false);

  // Consulta para comprovar que NENHUM campo foi apagado
  const getAfterMerge = await rpcCall({
    method: 'tools/call',
    params: {
      name: 'obter_empreendimento',
      arguments: { id: createdDevId },
    },
  });
  const afterMerge = JSON.parse(getAfterMerge.json.result.content[0].text);
  assert.strictEqual(afterMerge.descricao, 'Descrição atualizada mantendo endereço, entrega, links e status intactos.');
  assert.strictEqual(afterMerge.endereco, 'Cabo Branco, João Pessoa', 'Endereço público mantido');
  assert.strictEqual(afterMerge.interno?.endereco_completo, 'Av. Cabo Branco, 1800, Apt 301', 'Endereço completo mantido');
  assert.strictEqual(afterMerge.observacao, 'Observação geral do condomínio.', 'Observação pública mantida');
  assert.strictEqual(afterMerge.interno?.observacao_interna, 'Observação interna confidencial sobre negociação e comissão de 6%.', 'Observação interna mantida');
  assert.strictEqual(afterMerge.nome_publico, null, 'Nome público continua null');
  assert.strictEqual(afterMerge.entrega, '2027-12', 'Entrega não pode ter sido apagada');
  assert.strictEqual(afterMerge.interno?.link_tabela, 'https://docs.google.com/spreadsheets/d/tabela-exemplo', 'link_tabela deve ser mantido');
  assert.strictEqual(afterMerge.interno?.link_pasta, 'https://drive.google.com/drive/folders/pasta-exemplo', 'link_pasta deve ser mantido');
  assert.strictEqual(afterMerge.data_tabela, 'Outubro/2026', 'data_tabela deve ser mantida');
  assert.strictEqual(afterMerge.interno?.construtora, 'Alliance Construtora', 'construtora deve ser mantida');
  assert.strictEqual(afterMerge.interno?.contato_construtora, '(83) 99999-8888 (Eng. Carlos)', 'contato_construtora deve ser mantido');
  assert.strictEqual(afterMerge.status, 'Lançamento', 'status não pode ter sido reiniciado');
  assert.strictEqual(afterMerge.vagas, null, 'Vagas continua null');
  assert.strictEqual(afterMerge.diferenciais.length, 3, 'diferenciais devem ser preservados');
  console.log('  ✓ Upsert enviando só descricao preservou todos os campos anteriores intactos: PASS');

  // 5. TESTAR IDEMPOTÊNCIA: segunda chamada atualiza preço sem duplicar
  console.log('\n[5] Testando idempotência (atualização pontual de preço)...');
  const idempotentCall = await rpcCall({
    method: 'tools/call',
    params: {
      name: 'upsert_empreendimento',
      arguments: {
        chave_externa: testChaveExterna,
        preco_a_partir_de: 460000.0,
      },
    },
  });
  const idempResult = JSON.parse(idempotentCall.json.result.content[0].text);
  assert.strictEqual(idempResult.id, createdDevId, 'ID deve ser idêntico');
  assert.strictEqual(idempResult.criado, false, 'Deve marcar criado=false');
  console.log('  ✓ Idempotência confirmada (atualizado sem duplicar): PASS');

  // 5b. TESTAR buscar_empreendimentos: isolamento de teste e construtora dentro de "interno"
  console.log('\n[5b] Testando buscar_empreendimentos (filtro de teste e construtora em item.interno)...');
  
  // Busca padrão (sem incluir_testes): o registro de teste NÃO pode aparecer
  const searchDefault = await rpcCall({
    method: 'tools/call',
    params: {
      name: 'buscar_empreendimentos',
      arguments: {
        texto: testChaveExterna,
      },
    },
  });
  assert.strictEqual(searchDefault.status, 200);
  const searchDefaultResult = JSON.parse(searchDefault.json.result.content[0].text);
  assert.strictEqual(searchDefaultResult.itens.some((it) => it.chave_externa === testChaveExterna), false, 'Busca padrão nunca deve retornar registros de teste');

  // Busca explícita com incluir_testes: true deve retornar o registro
  const searchWithTests = await rpcCall({
    method: 'tools/call',
    params: {
      name: 'buscar_empreendimentos',
      arguments: {
        texto: testChaveExterna,
        incluir_testes: true,
      },
    },
  });
  assert.strictEqual(searchWithTests.status, 200);
  const searchResult = JSON.parse(searchWithTests.json.result.content[0].text);
  assert(searchResult.total >= 1, 'Deve encontrar o empreendimento de teste');
  const foundItem = searchResult.itens.find((it) => it.chave_externa === testChaveExterna);
  assert(foundItem, 'Item deve existir na lista de resultados com incluir_testes');
  assert.strictEqual(foundItem.is_teste, true, 'Item deve ter is_teste=true');
  assert.strictEqual(foundItem.construtora, undefined, 'construtora NÃO pode estar no nível de cima (raiz)');
  assert(foundItem.interno, 'item.interno deve existir quando incluir_internos=true (padrão)');
  assert.strictEqual(foundItem.interno.construtora, 'Alliance Construtora', 'interno.construtora deve ser Alliance Construtora');
  assert.strictEqual(foundItem.interno.contato_construtora, '(83) 99999-8888 (Eng. Carlos)');
  assert.strictEqual(foundItem.interno.observacao_interna, 'Observação interna confidencial sobre negociação e comissão de 6%.');
  assert.strictEqual(foundItem.interno.endereco_completo, 'Av. Cabo Branco, 1800, Apt 301');

  // Testar buscar_empreendimentos com incluir_internos: false
  const searchWithoutInternals = await rpcCall({
    method: 'tools/call',
    params: {
      name: 'buscar_empreendimentos',
      arguments: {
        texto: testChaveExterna,
        incluir_testes: true,
        incluir_internos: false,
      },
    },
  });
  const searchWithoutInternalsResult = JSON.parse(searchWithoutInternals.json.result.content[0].text);
  const foundWithoutInternals = searchWithoutInternalsResult.itens.find((it) => it.chave_externa === testChaveExterna);
  assert(foundWithoutInternals, 'Item deve existir');
  assert.strictEqual(foundWithoutInternals.construtora, undefined);
  assert.strictEqual(foundWithoutInternals.interno, undefined, 'item.interno deve ser omitido quando incluir_internos=false');
  console.log('  ✓ buscar_empreendimentos filtra is_teste por padrão e isola construtora em objeto interno: PASS');

  // 5c. TESTE DE VALIDAÇÃO DE IMAGENS: rejeitar imagens menores que 400x300 ou de uma cor só (std dev < 8)
  console.log('\n[5c] Testando rejeição de imagem inválida (pequena ou monocromática)...');
  const smallImgCall = await rpcCall({
    method: 'tools/call',
    params: {
      name: 'adicionar_foto',
      arguments: {
        empreendimento_id: createdDevId,
        url: makeInvalidSmallPng(),
        legenda: 'Imagem Pequena Inválida',
      },
    },
  });
  assert(smallImgCall.json.result.isError, 'Imagem menor que 400x300 deve ser rejeitada com erro');
  assert(smallImgCall.json.result.content[0].text.includes('imagem inválida'), 'Erro deve ser "imagem inválida"');

  const monoImgCall = await rpcCall({
    method: 'tools/call',
    params: {
      name: 'adicionar_foto',
      arguments: {
        empreendimento_id: createdDevId,
        url: makeInvalidMonochromePng(),
        legenda: 'Imagem Monocromática Inválida',
      },
    },
  });
  assert(monoImgCall.json.result.isError, 'Imagem de uma cor só deve ser rejeitada com erro');
  assert(monoImgCall.json.result.content[0].text.includes('imagem inválida'), 'Erro deve ser "imagem inválida"');
  console.log('  ✓ Rejeição de imagens menores que 400x300 px ou monocromáticas com erro "imagem inválida": PASS');

  // 6. TESTAR adicionar_fotos_lote (10 fotos válidas em série e confirmar 10 gravadas)
  console.log('\n[6] Testando adicionar_fotos_lote com 10 fotos válidas em série...');
  const batch10Photos = Array.from({ length: 10 }, (_, i) => ({
    url: makeValidTestImage(i),
    legenda: `Foto Lote #${i + 1}`,
    ordem: i,
    capa: i === 4, // Foto #5 deve ser definida como capa
  }));

  const batchCall = await rpcCall({
    method: 'tools/call',
    params: {
      name: 'adicionar_fotos_lote',
      arguments: {
        empreendimento_id: createdDevId,
        fotos: batch10Photos,
      },
    },
  });

  assert.strictEqual(batchCall.status, 200);
  assert.strictEqual(batchCall.json.result.isError, false);
  const batchResult = JSON.parse(batchCall.json.result.content[0].text);
  console.log('  ✓ Resultado do adicionar_fotos_lote:', {
    total_enviadas: batchResult.total_enviadas,
    total_gravado: batchResult.total_gravado,
  });
  assert.strictEqual(batchResult.total_enviadas, 10, 'Deve ter recebido 10 fotos');
  assert.strictEqual(batchResult.total_gravado, 10, 'Deve ter gravado exatamente 10 fotos');

  // Confirmação via listar_fotos
  const listFotosRes1 = await rpcCall({
    method: 'tools/call',
    params: {
      name: 'listar_fotos',
      arguments: { empreendimento_id: createdDevId },
    },
  });
  const fotosGravadas1 = JSON.parse(listFotosRes1.json.result.content[0].text);
  assert.strictEqual(fotosGravadas1.total, 10, 'Devem existir exatamente 10 fotos gravadas');
  console.log('  ✓ 10 fotos via adicionar_fotos_lote gravadas com sucesso: PASS');

  // 7. TESTAR CONDIÇÃO DE CORRIDA: 10 chamadas adicionar_foto EM PARALELO
  console.log('\n[7] Testando condição de corrida (10 chamadas simultâneas adicionar_foto via Promise.all)...');
  const parallelCalls = Array.from({ length: 10 }, (_, i) => {
    return rpcCall({
      method: 'tools/call',
      params: {
        name: 'adicionar_foto',
        arguments: {
          empreendimento_id: createdDevId,
          url: makeValidTestImage(10 + i),
          legenda: `Foto Paralela #${i + 1}`,
          ordem: 10 + i,
        },
      },
      id: 100 + i,
    });
  });

  const parallelResults = await Promise.all(parallelCalls);
  parallelResults.forEach((res, i) => {
    assert.strictEqual(res.status, 200, `Chamada paralela #${i + 1} deve retornar 200`);
    assert.strictEqual(res.json.result.isError, false, `Chamada paralela #${i + 1} não deve ter erro`);
  });

  // Confirmação via listar_fotos: Agora devem existir 10 (lote) + 10 (paralelas) = 20 fotos!
  const listFotosRes2 = await rpcCall({
    method: 'tools/call',
    params: {
      name: 'listar_fotos',
      arguments: { empreendimento_id: createdDevId },
    },
  });
  const fotosGravadas2 = JSON.parse(listFotosRes2.json.result.content[0].text);
  console.log(`  ✓ Total de fotos após 10 chamadas paralelas: ${fotosGravadas2.total} (esperado: 20)`);
  assert.strictEqual(fotosGravadas2.total, 20, 'Todas as 10 fotos simultâneas devem ser persistidas sem perda por corrida');
  console.log('  ✓ Condição de corrida em adicionar_foto resolvida com sucesso: PASS');

  // 8. ADICIONAR UNIDADES COM VALORES NÃO INFORMADOS (NULL)
  console.log('\n[8] Testando upsert_unidades_lote com campos omitidos/null...');
  const unitsCall = await rpcCall({
    method: 'tools/call',
    params: {
      name: 'upsert_unidades_lote',
      arguments: {
        empreendimento_id: createdDevId,
        unidades: [
          {
            chave_externa: `${testChaveExterna}-apto-101`,
            unidade: '101',
            torre_bloco: 'Torre Mar',
            tipo: 'Studio',
            quartos: 1,
            suites: 1,
            posicao: 'Nascente Norte',
            andar: 5,
            vagas: 1,
            banheiros: 1,
            mobiliado: false,
            area_m2: 32.5,
            metragem_texto: '32,5m²',
            preco: 460000.0,
            // sinal e parcela omitidos intencionalmente
            status: 'disponivel',
          },
          {
            chave_externa: `${testChaveExterna}-apto-102`,
            unidade: '102',
            torre_bloco: 'Torre Mar',
            tipo: 'Apartamento',
            // quartos, suites, area_m2, preco, sinal omitidos intencionalmente
            status: 'disponivel',
          },
        ],
      },
    },
  });
  assert.strictEqual(unitsCall.status, 200);
  const unitsResult = JSON.parse(unitsCall.json.result.content[0].text);
  assert.strictEqual(unitsResult.criadas, 2, 'Deve ter criado 2 unidades');

  // Validação dos campos null e posicao "Nascente Norte" nas unidades
  const getFullDev = await rpcCall({
    method: 'tools/call',
    params: {
      name: 'obter_empreendimento',
      arguments: { chave_externa: testChaveExterna },
    },
  });
  const fullDev = JSON.parse(getFullDev.json.result.content[0].text);
  const u101 = fullDev.unidades.find((u) => u.chave_externa.endsWith('-apto-101'));
  const u102 = fullDev.unidades.find((u) => u.chave_externa.endsWith('-apto-102'));
  assert.strictEqual(u101.posicao, 'Nascente Norte', 'Posição da unidade deve ser "Nascente Norte"');
  assert.strictEqual(u101.position, undefined, 'Campo duplicado position deve ser removido');
  assert.strictEqual(u101.andar, 5, 'Andar da unidade deve ser 5');
  assert.strictEqual(u101.banheiros, 1, 'Banheiros da unidade deve ser 1');
  assert.strictEqual(u101.vagas, 1, 'Vagas da unidade deve ser 1');
  assert.strictEqual(u101.mobiliado, false, 'Mobiliado da unidade deve ser false');
  assert.strictEqual(u101.sinal, null, 'Sinal omitido deve ser null');
  assert.strictEqual(u101.parcela, null, 'Parcela omitida deve ser null');
  assert.strictEqual(u102.quartos, null, 'Quartos omitido na unidade 102 deve ser null');
  assert.strictEqual(u102.preco, null, 'Preço omitido na unidade 102 deve ser null');
  console.log('  ✓ Unidade com posicao "Nascente Norte", sem position, andar, banheiros, vagas, mobiliado e campos não informados como NULL: PASS');

  // 8b. VALIDAÇÃO DE ISOLAMENTO CONFIDENCIAL (CLIENTE / COMPARTILHAMENTO)
  console.log('\n[8b] Conferindo isolamento de dados confidenciais (cliente / compartilhamento)...');
  const publicListing = buildPublicListing({
    id: createdDevId,
    title: afterMerge.nome,
    type: 'Apartamento',
    neighborhood: afterMerge.bairro,
    price: afterMerge.preco_a_partir_de,
    partner_name: afterMerge.interno?.construtora,
    partner_phone: afterMerge.interno?.contato_construtora,
    contato_construtora: afterMerge.interno?.contato_construtora,
    observacao_interna: afterMerge.interno?.observacao_interna,
    internal_notes: afterMerge.interno?.observacao_interna,
    link_tabela: afterMerge.interno?.link_tabela,
    link_pasta: afterMerge.interno?.link_pasta,
    endereco_completo: afterMerge.interno?.endereco_completo,
    address: afterMerge.endereco,
  });
  assert.strictEqual(publicListing.partner_name, undefined);
  assert.strictEqual(publicListing.partner_phone, undefined);
  assert.strictEqual(publicListing.contato_construtora, undefined);
  assert.strictEqual(publicListing.observacao_interna, undefined);
  assert.strictEqual(publicListing.link_tabela, undefined);
  assert.strictEqual(publicListing.link_pasta, undefined);
  assert.strictEqual(publicListing.endereco_completo, undefined);
  assert(!JSON.stringify(publicListing).includes('comissão de 6%'), 'Nenhum dado confidencial no payload público');
  console.log('  ✓ Dados internos (construtora, contato, observação, links e endereço completo) estritamente omitidos na visão do cliente: PASS');

  // 9. MARCAR STATUS DE UNIDADE: marcar_unidades_status
  console.log('\n[9] Testando marcar unidade como vendida...');
  const markCall = await rpcCall({
    method: 'tools/call',
    params: {
      name: 'marcar_unidades_status',
      arguments: {
        empreendimento_id: createdDevId,
        chaves_externas: [`${testChaveExterna}-apto-101`],
        status: 'vendida',
      },
    },
  });
  const markResult = JSON.parse(markCall.json.result.content[0].text);
  assert.strictEqual(markResult.atualizadas, 1);
  console.log('  ✓ Unidade 101 marcada como vendida: PASS');

  // 10. DESATIVAR EMPREENDIMENTO: desativar_empreendimento (soft delete)
  console.log('\n[10] Testando desativação do empreendimento...');
  const deactCall = await rpcCall({
    method: 'tools/call',
    params: {
      name: 'desativar_empreendimento',
      arguments: {
        id: createdDevId,
        motivo: 'Teste automatizado concluído',
      },
    },
  });
  const deactResult = JSON.parse(deactCall.json.result.content[0].text);
  assert.strictEqual(deactResult.ativo, false);
  assert.strictEqual(deactResult.status, 'Arquivado');
  console.log('  ✓ Empreendimento desativado com segurança (soft delete): PASS');
  } finally {
    console.log('\n[FINALLY] Executando limpeza estrita do registro de teste...');
    await cleanupTestDev(testChaveExterna, createdDevId);
    console.log('  ✓ Limpeza concluída: nenhum resíduo de teste deixado no estoque, banco ou R2.');
  }

  console.log('\n========================================================');
  console.log('TODOS OS TESTES (LOTE, PARALELO, NULLS, OBSERVAÇÃO, IS_TESTE, IMAGENS) PASSARAM!');
  console.log('========================================================');
}

runMcpTests().catch((err) => {
  console.error('ERRO NO TESTE DO MCP SERVER:', err);
  process.exit(1);
});
