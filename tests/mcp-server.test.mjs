import assert from 'node:assert';
import { handleMcpServer } from '../api/_shared/mcp-server.js';
import { buildPublicListing } from '../api/_shared/public-pages.js';
import { Readable } from 'node:stream';

const TEST_TOKEN = process.env.CRM_MCP_TOKEN || 'mcp_sec_7a9f82d4c01e68b31a54b9d0e12f';

function makeDistinctPngDataUrl(index) {
  const basePng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  const comment = `test-img-${index}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const chunkData = Buffer.from(`Comment\0${comment}`);
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(chunkData.length);
  const typeBuf = Buffer.from('tEXt');
  const crcBuf = Buffer.alloc(4);
  const customChunk = Buffer.concat([lenBuf, typeBuf, chunkData, crcBuf]);
  
  const iendPos = basePng.length - 12;
  const newPng = Buffer.concat([
    basePng.subarray(0, iendPos),
    customChunk,
    basePng.subarray(iendPos),
  ]);
  return `data:image/png;base64,${newPng.toString('base64')}`;
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
  assert(toolNames.includes('adicionar_fotos_lote'));
  assert(toolNames.includes('adicionar_foto_base64'));
  assert(toolNames.includes('listar_fotos'));
  assert(toolNames.includes('remover_foto'));
  assert(toolNames.includes('definir_capa'));
  assert(toolNames.includes('upsert_unidades_lote'));
  assert(toolNames.includes('marcar_unidades_status'));
  assert(toolNames.includes('desativar_empreendimento'));
  console.log('  ✓ Todas as ferramentas do Grokbot presentes com schemas completos: PASS');

  const testChaveExterna = `teste-grok-infinity-${Date.now()}`;

  // 4. CRIAR EMPREENDIMENTO COM VALORES PADRÕES E CAMPOS CONFIDENCIAIS
  console.log('\n[4] Testando criação de empreendimento (origem="construtora", condicao="novo", vagas=NULL, campos internos)...');
  const createCall = await rpcCall({
    method: 'tools/call',
    params: {
      name: 'upsert_empreendimento',
      arguments: {
        chave_externa: testChaveExterna,
        nome: 'Residencial Infinity Ocean Teste Grok',
        construtora: 'Alliance Construtora',
        contato_construtora: '(83) 99999-8888 (Eng. Carlos)',
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
        // vagas omitido intencionalmente: deve permanecer NULL ("não informado"), nunca 0!
        observacao_interna: 'Observação interna confidencial sobre negociação e comissão de 6%.',
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
  const createdDevId = createResult.id;

  // 4b. VERIFICAR PADRÕES (origem="construtora", condicao="novo", vagas=null, campos internos)
  console.log('\n[4b] Verificando se origem="construtora", condicao="novo", vagas=null e campos internos foram persistidos...');
  const getDevCall = await rpcCall({
    method: 'tools/call',
    params: {
      name: 'obter_empreendimento',
      arguments: { chave_externa: testChaveExterna },
    },
  });
  const devData = JSON.parse(getDevCall.json.result.content[0].text);
  assert.strictEqual(devData.origem, 'construtora', 'Origem padrão deve ser "construtora"');
  assert.strictEqual(devData.condicao, 'novo', 'Condição padrão para construtora deve ser "novo"');
  assert.strictEqual(devData.vagas, null, 'Vagas omitido deve ser estritamente null (nunca 0)');
  assert.strictEqual(devData.construtora, 'Alliance Construtora');
  assert.strictEqual(devData.contato_construtora, '(83) 99999-8888 (Eng. Carlos)');
  assert.strictEqual(devData.observacao_interna, 'Observação interna confidencial sobre negociação e comissão de 6%.');
  console.log('  ✓ Origem="construtora", condicao="novo", vagas=null e campos internos conferidos: PASS');

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
  assert.strictEqual(afterMerge.endereco, 'Av. Cabo Branco, 1800', 'Endereço não pode ter sido apagado');
  assert.strictEqual(afterMerge.entrega, '2027-12', 'Entrega não pode ter sido apagada');
  assert.strictEqual(afterMerge.link_tabela, 'https://docs.google.com/spreadsheets/d/tabela-exemplo', 'link_tabela deve ser mantido');
  assert.strictEqual(afterMerge.link_pasta, 'https://drive.google.com/drive/folders/pasta-exemplo', 'link_pasta deve ser mantido');
  assert.strictEqual(afterMerge.data_tabela, 'Outubro/2026', 'data_tabela deve ser mantida');
  assert.strictEqual(afterMerge.construtora, 'Alliance Construtora', 'construtora deve ser mantida');
  assert.strictEqual(afterMerge.contato_construtora, '(83) 99999-8888 (Eng. Carlos)', 'contato_construtora deve ser mantido');
  assert.strictEqual(afterMerge.observacao_interna, 'Observação interna confidencial sobre negociação e comissão de 6%.', 'observacao_interna mantida');
  assert.strictEqual(afterMerge.status, 'Lançamento', 'status não pode ter sido reiniciado');
  assert.strictEqual(afterMerge.vagas, null, 'Vagas continua null');
  assert.strictEqual(afterMerge.diferenciais.length, 3, 'diferenciais devem ser preservados');
  console.log('  ✓ Upsert enviando só descricao preservou todos os 11 campos anteriores intactos: PASS');

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

  // 6. TESTAR adicionar_fotos_lote (10 fotos em série e confirmar 10 gravadas)
  console.log('\n[6] Testando adicionar_fotos_lote com 10 fotos em série...');
  const batch10Photos = Array.from({ length: 10 }, (_, i) => ({
    url: makeDistinctPngDataUrl(`lote-${i}`),
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
          url: makeDistinctPngDataUrl(`paralelo-${i}`),
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
  assert.strictEqual(u101.position, 'Nascente Norte');
  assert.strictEqual(u101.sinal, null, 'Sinal omitido deve ser null');
  assert.strictEqual(u101.parcela, null, 'Parcela omitida deve ser null');
  assert.strictEqual(u102.quartos, null, 'Quartos omitido na unidade 102 deve ser null');
  assert.strictEqual(u102.preco, null, 'Preço omitido na unidade 102 deve ser null');
  console.log('  ✓ Unidade com posicao "Nascente Norte" e campos não informados preservados como NULL: PASS');

  // 8b. VALIDAÇÃO DE ISOLAMENTO CONFIDENCIAL (CLIENTE / COMPARTILHAMENTO)
  console.log('\n[8b] Conferindo isolamento de dados confidenciais (cliente / compartilhamento)...');
  const publicListing = buildPublicListing({
    id: createdDevId,
    title: afterMerge.nome,
    type: 'Apartamento',
    neighborhood: afterMerge.bairro,
    price: afterMerge.preco_a_partir_de,
    partner_name: afterMerge.construtora,
    partner_phone: afterMerge.contato_construtora,
    contato_construtora: afterMerge.contato_construtora,
    observacao_interna: afterMerge.observacao_interna,
    internal_notes: afterMerge.observacao_interna,
    link_tabela: afterMerge.link_tabela,
    link_pasta: afterMerge.link_pasta,
    endereco_completo: afterMerge.endereco,
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

  console.log('\n========================================================');
  console.log('TODOS OS TESTES (LOTE, PARALELO, NULLS, OBSERVAÇÃO) PASSARAM!');
  console.log('========================================================');
}

runMcpTests().catch((err) => {
  console.error('ERRO NO TESTE DO MCP SERVER:', err);
  process.exit(1);
});
