import assert from 'node:assert';
import http2 from 'node:http2';

const BASE_URL = 'https://ronaldomeira.com.br';
const MCP_PATH = '/api/mcp?v=2';
const TOKEN = process.env.CRM_MCP_TOKEN || 'mcp_sec_7a9f82d4c01e68b31a54b9d0e12f';

function rpc(client, method, params = {}, id = 1) {
  return new Promise((resolve, reject) => {
    const req = client.request({
      ':path': MCP_PATH,
      ':method': 'POST',
      'content-type': 'application/json',
      'authorization': `Bearer ${TOKEN}`,
    });

    let data = '';
    req.on('response', (headers) => {
      const status = headers[':status'];
      if (status !== 200) {
        reject(new Error(`HTTP status ${status}`));
      }
    });
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.error) {
          reject(new Error(`RPC Error [${parsed.error.code}]: ${parsed.error.message}`));
        } else {
          resolve(parsed.result);
        }
      } catch (err) {
        reject(new Error(`Failed to parse response: ${err.message}. Raw: ${data}`));
      }
    });
    req.on('error', reject);
    req.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
    req.end();
  });
}

async function run() {
  console.log('====================================================');
  console.log('VERIFICAÇÃO LIVE EM PRODUÇÃO (v1.2.3) VIA HTTP/2');
  console.log('Endpoint:', `${BASE_URL}${MCP_PATH}`);
  console.log('====================================================\n');

  const client = http2.connect(BASE_URL);
  client.on('error', (err) => console.error('H2 Client Error:', err));

  try {
    // 1. Handshake initialize
    console.log('[1] Verificando initialize...');
    const initResult = await rpc(client, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'live-verifier-v123', version: '1.2.3' },
    });
    console.log('  ✓ Servidor:', initResult.serverInfo);
    assert.strictEqual(initResult.serverInfo.version, '1.2.3', 'Versão deve ser 1.2.3');

    // 2. tools/list
    console.log('\n[2] Verificando catálogo de ferramentas (tools/list)...');
    const listResult = await rpc(client, 'tools/list');
    const tools = listResult.tools;
    const toolMap = new Map(tools.map(t => [t.name, t]));

    const deactTool = toolMap.get('desativar_empreendimento');
    assert.ok(deactTool, 'desativar_empreendimento deve existir');
    assert.ok(
      deactTool.description.includes('soft delete: ativo=false; a fase da obra em status é preservada'),
      'Descrição deve especificar soft delete com preservação de status'
    );
    console.log('  ✓ desativar_empreendimento schema e descrição validados');

    // 3. Teste funcional de desativação, preservação de status e reativação com is_teste: true
    const testKey = 'teste-antigravity';

    try {
      console.log('\n[3] Criando empreendimento com status="lancamento"...');
      const createRes = await rpc(client, 'tools/call', {
        name: 'upsert_empreendimento',
        arguments: {
          chave_externa: testKey,
          nome: 'Residencial Teste Verificação 1.2.3',
          bairro: 'Cabo Branco',
          cidade: 'João Pessoa',
          origem: 'construtora',
          condicao: 'novo',
          status: 'lancamento',
          is_teste: true,
        },
      });
      const parsedCreate = JSON.parse(createRes.content[0].text);
      console.log('  ✓ Criado com ID:', parsedCreate.id);

      // Desativar empreendimento
      console.log('\n[4] Chamando desativar_empreendimento...');
      const deactRes = await rpc(client, 'tools/call', {
        name: 'desativar_empreendimento',
        arguments: {
          chave_externa: testKey,
          motivo: 'Teste v1.2.3 concluído',
        },
      });
      const deactParsed = JSON.parse(deactRes.content[0].text);
      console.log('  ✓ Retorno desativar:', deactParsed);
      assert.strictEqual(deactParsed.ativo, false, 'ativo deve ser false');
      assert.strictEqual(deactParsed.status, 'lancamento', 'status deve ser preservado como "lancamento", NUNCA "Arquivado"');
      assert.strictEqual(deactParsed.motivo, 'Teste v1.2.3 concluído');
      assert.ok(deactParsed.desativado_em);

      // Obter e conferir
      console.log('\n[5] Conferindo obter_empreendimento...');
      const getRes = await rpc(client, 'tools/call', {
        name: 'obter_empreendimento',
        arguments: { chave_externa: testKey },
      });
      const getParsed = JSON.parse(getRes.content[0].text);
      console.log('  ✓ Retorno obter: status =', getParsed.status, ', ativo =', getParsed.ativo);
      assert.strictEqual(getParsed.ativo, false);
      assert.strictEqual(getParsed.status, 'lancamento');
      assert.strictEqual(getParsed.motivo_desativacao, 'Teste v1.2.3 concluído');
      assert.ok(getParsed.desativado_em);

      // Buscar e conferir
      console.log('\n[6] Conferindo buscar_empreendimentos...');
      const searchRes = await rpc(client, 'tools/call', {
        name: 'buscar_empreendimentos',
        arguments: { chave_externa: testKey, incluir_testes: true },
      });
      const searchParsed = JSON.parse(searchRes.content[0].text);
      const foundItem = searchParsed.itens.find(i => i.chave_externa === testKey);
      assert.ok(foundItem, 'Item deve ser encontrado na busca');
      console.log('  ✓ Retorno buscar: status =', foundItem.status, ', ativo =', foundItem.ativo);
      assert.strictEqual(foundItem.ativo, false);
      assert.strictEqual(foundItem.status, 'lancamento');
      assert.strictEqual(foundItem.motivo_desativacao, 'Teste v1.2.3 concluído');
      assert.ok(foundItem.desativado_em);
      console.log('  ✓ CRITÉRIO 1 VALIDADO: desativar, obter e buscar retornam mesmo status ("lancamento") e ativo:false');

      // Reativação com ativo:true
      console.log('\n[7] Reativando empreendimento com ativo:true...');
      const reactRes = await rpc(client, 'tools/call', {
        name: 'upsert_empreendimento',
        arguments: {
          chave_externa: testKey,
          ativo: true,
        },
      });
      const reactParsed = JSON.parse(reactRes.content[0].text);
      assert.strictEqual(reactParsed.ativo, true);

      const getReactRes = await rpc(client, 'tools/call', {
        name: 'obter_empreendimento',
        arguments: { chave_externa: testKey },
      });
      const getReactParsed = JSON.parse(getReactRes.content[0].text);
      console.log('  ✓ Retorno pós-reativação: status =', getReactParsed.status, ', ativo =', getReactParsed.ativo);
      assert.strictEqual(getReactParsed.ativo, true);
      assert.strictEqual(getReactParsed.status, 'lancamento', 'Reativação deve preservar status intacto');
      assert.strictEqual(getReactParsed.motivo_desativacao, null, 'motivo_desativacao deve ser limpo na reativação');
      assert.strictEqual(getReactParsed.desativado_em, null, 'desativado_em deve ser limpo na reativação');
      console.log('  ✓ CRITÉRIO 3 VALIDADO: Reativação com ativo:true mantém status e limpa motivo/data de desativação');

    } finally {
      // Limpeza estrita no bloco finally
      console.log('\n[FINALLY] Executando limpeza estrita do registro de teste...');
      try {
        await rpc(client, 'tools/call', {
          name: 'desativar_empreendimento',
          arguments: {
            chave_externa: testKey,
            motivo: 'Limpeza automática pós verificação live v1.2.3',
          },
        });
        console.log('  ✓ Registro desativado com segurança (soft-delete).');
      } catch (err) {
        console.error('  ⚠️ Erro na limpeza final:', err.message);
      }
    }

    console.log('\n====================================================');
    console.log('TODAS AS VERIFICAÇÕES DE PRODUÇÃO (v1.2.3) PASSARAM!');
    console.log('====================================================');
  } finally {
    client.close();
  }
}

run().catch((err) => {
  console.error('\n❌ ERRO NA VERIFICAÇÃO LIVE:', err);
  process.exit(1);
});
