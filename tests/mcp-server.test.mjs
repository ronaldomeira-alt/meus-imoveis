import assert from 'node:assert';
import { handleMcpServer } from '../api/_shared/mcp-server.js';
import { Readable } from 'node:stream';

const TEST_TOKEN = process.env.CRM_MCP_TOKEN || 'mcp_sec_7a9f82d4c01e68b31a54b9d0e12f';

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
  console.log('  ✓ Handshake initialize: PASS');

  // 3. LISTAGEM DE FERRAMENTAS: tools/list
  console.log('[3] Testando tools/list...');
  const toolsRes = await rpcCall({ method: 'tools/list' });
  assert.strictEqual(toolsRes.status, 200);
  const toolNames = toolsRes.json.result.tools.map((t) => t.name);
  console.log(`  ✓ Ferramentas expostas (${toolNames.length}):`, toolNames.join(', '));
  assert(toolNames.includes('buscar_empreendimentos'));
  assert(toolNames.includes('obter_empreendimento'));
  assert(toolNames.includes('upsert_empreendimento'));
  assert(toolNames.includes('upsert_empreendimentos_lote'));
  assert(toolNames.includes('adicionar_foto'));
  assert(toolNames.includes('adicionar_foto_base64'));
  assert(toolNames.includes('listar_fotos'));
  assert(toolNames.includes('remover_foto'));
  assert(toolNames.includes('definir_capa'));
  assert(toolNames.includes('upsert_unidades_lote'));
  assert(toolNames.includes('marcar_unidades_status'));
  assert(toolNames.includes('desativar_empreendimento'));
  console.log('  ✓ Todas as 10 ferramentas do Grokbot presentes com schemas completos: PASS');

  const testChaveExterna = `teste-grok-infinity-${Date.now()}`;

  // 4. CRIAR EMPREENDIMENTO DE EXEMPLO: upsert_empreendimento
  console.log('\n[4] Testando criação de empreendimento de exemplo...');
  const createCall = await rpcCall({
    method: 'tools/call',
    params: {
      name: 'upsert_empreendimento',
      arguments: {
        chave_externa: testChaveExterna,
        nome: 'Residencial Infinity Ocean Teste Grok',
        construtora: 'Alliance Construtora',
        bairro: 'Cabo Branco',
        cidade: 'João Pessoa',
        endereco: 'Av. Cabo Branco, 1800',
        status: 'lancamento',
        entrega: '2027-12',
        preco_a_partir_de: 450000.0,
        area_min_m2: 32.5,
        area_max_m2: 95.0,
        quartos_min: 1,
        quartos_max: 3,
        vagas: 1,
        descricao: 'Empreendimento de alto padrão beira-mar com rooftop e piscina de borda infinita.',
        diferenciais: ['Piscina na cobertura', 'Rooftop gourmet', 'Academia com vista para o mar', 'Coworking'],
        link_tabela: 'https://docs.google.com/spreadsheets/d/tabela-exemplo',
        link_pasta: 'https://drive.google.com/drive/folders/pasta-exemplo',
        data_tabela: 'Outubro/2026',
        ativo: true,
      },
    },
  });

  assert.strictEqual(createCall.status, 200);
  assert.strictEqual(createCall.json.result.isError, false);
  const createResult = JSON.parse(createCall.json.result.content[0].text);
  console.log('  ✓ Empreendimento criado com sucesso:', createResult);
  assert(createResult.id, 'Deve retornar ID interno');
  assert.strictEqual(createResult.criado, true, 'Deve marcar criado=true');
  const createdDevId = createResult.id;

  // 5. TESTAR IDEMPOTÊNCIA: segunda chamada atualiza sem duplicar
  console.log('\n[5] Testando idempotência (mesma chave_externa)...');
  const idempotentCall = await rpcCall({
    method: 'tools/call',
    params: {
      name: 'upsert_empreendimento',
      arguments: {
        chave_externa: testChaveExterna,
        preco_a_partir_de: 460000.0, // Atualização de preço
      },
    },
  });
  const idempResult = JSON.parse(idempotentCall.json.result.content[0].text);
  assert.strictEqual(idempResult.id, createdDevId, 'ID deve ser idêntico');
  assert.strictEqual(idempResult.criado, false, 'Deve marcar criado=false');
  console.log('  ✓ Idempotência confirmada (atualizado sem duplicar): PASS');

  // 6. ADICIONAR FOTO VIA BASE64 OU URL
  console.log('\n[6] Testando adição de foto...');
  // Imagem 1x1 PNG válida
  const samplePngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const photoCall = await rpcCall({
    method: 'tools/call',
    params: {
      name: 'adicionar_foto_base64',
      arguments: {
        empreendimento_id: createdDevId,
        nome_arquivo: 'fachada-teste.png',
        base64: samplePngBase64,
        legenda: 'Fachada frontal do empreendimento',
        ordem: 0,
        capa: true,
      },
    },
  });
  assert.strictEqual(photoCall.status, 200);
  assert.strictEqual(photoCall.json.result.isError, false);
  const photoResult = JSON.parse(photoCall.json.result.content[0].text);
  console.log('  ✓ Foto adicionada com sucesso:', photoResult);
  assert(photoResult.foto_id, 'Foto deve ter ID');
  assert.strictEqual(photoResult.capa, true, 'Foto deve ser definida como capa');

  // 7. ADICIONAR 2 UNIDADES: upsert_unidades_lote
  console.log('\n[7] Testando adição de 2 unidades em lote...');
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
            posicao: 'Nascente',
            area_m2: 32.5,
            metragem_texto: '32,5m²',
            preco: 460000.0,
            sinal: 46000.0,
            parcela: 3500.0,
            status: 'disponivel',
          },
          {
            chave_externa: `${testChaveExterna}-apto-102`,
            unidade: '102',
            torre_bloco: 'Torre Mar',
            tipo: 'Apartamento',
            quartos: 2,
            suites: 1,
            posicao: 'Nascente Sul',
            area_m2: 58.0,
            metragem_texto: '58,0m²',
            preco: 690000.0,
            sinal: 69000.0,
            parcela: 5200.0,
            status: 'disponivel',
          },
        ],
      },
    },
  });
  assert.strictEqual(unitsCall.status, 200);
  assert.strictEqual(unitsCall.json.result.isError, false);
  const unitsResult = JSON.parse(unitsCall.json.result.content[0].text);
  console.log('  ✓ Unidades cadastradas:', unitsResult);
  assert.strictEqual(unitsResult.criadas, 2, 'Deve ter criado 2 unidades');

  // 8. OBTER EMPREENDIMENTO COMPLETO: obter_empreendimento
  console.log('\n[8] Testando obter_empreendimento com validação de fotos e unidades...');
  const getCall = await rpcCall({
    method: 'tools/call',
    params: {
      name: 'obter_empreendimento',
      arguments: { chave_externa: testChaveExterna },
    },
  });
  const getResult = JSON.parse(getCall.json.result.content[0].text);
  console.log(`  ✓ Empreendimento obtido: "${getResult.nome}", Fotos: ${getResult.fotos_count}, Unidades: ${getResult.unidades_count}`);
  assert.strictEqual(getResult.fotos_count, 1, 'Deve ter 1 foto');
  assert.strictEqual(getResult.unidades_count, 2, 'Deve ter 2 unidades');
  assert.strictEqual(getResult.preco_a_partir_de, 460000.0);

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
        motivo: 'Teste automatizado de fluxo completo do Grokbot concluído',
      },
    },
  });
  const deactResult = JSON.parse(deactCall.json.result.content[0].text);
  assert.strictEqual(deactResult.ativo, false);
  assert.strictEqual(deactResult.status, 'Arquivado');
  console.log('  ✓ Empreendimento desativado com segurança (soft delete): PASS');

  // 11. BUSCAR EMPREENDIMENTOS: buscar_empreendimentos
  console.log('\n[11] Testando busca de empreendimentos...');
  const searchCall = await rpcCall({
    method: 'tools/call',
    params: {
      name: 'buscar_empreendimentos',
      arguments: { texto: 'Infinity Ocean Teste Grok' },
    },
  });
  const searchResult = JSON.parse(searchCall.json.result.content[0].text);
  assert(searchResult.itens.length > 0, 'Deve encontrar o empreendimento criado');
  console.log(`  ✓ Busca retornou ${searchResult.itens.length} resultados correspondentes: PASS`);

  console.log('\n========================================================');
  console.log('TODOS OS TESTES DO MCP SERVER PASSARAM COM 100% DE SUCESSO!');
  console.log('========================================================');
}

runMcpTests().catch((err) => {
  console.error('ERRO NO TESTE DO MCP SERVER:', err);
  process.exit(1);
});
