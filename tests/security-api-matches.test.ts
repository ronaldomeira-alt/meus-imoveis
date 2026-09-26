import { describe, it } from 'node:test';
import assert from 'node:assert';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { authenticateMatchesRequest, handleMatches } from '../api/shared/matches.js';

const LEGITIMATE_TOKEN =
  'eyJhbGciOiJFUzI1NiIsImtpZCI6ImM2Zjk1NGVhLTVkNTYtNGRjZC04ZmI3LWYyYjEwMjZiNTJhMyIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL3FlZHB0bXJjdmNiemh1Y29lem5kLnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiJmOGRhZWIxOS00YjNlLTQyYjUtYjYwMy04ZDFkMWVjNjJmOWUiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzkwMzg2MzMxLCJpYXQiOjE3OTAzODI3MzEsImVtYWlsIjoicm9uYWxkb21laXJhQGdtYWlsLmNvbSIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiZW1haWxfdmVyaWZpZWQiOnRydWUsIm5hbWUiOiJSb25hbGRvIE1laXJhIiwicm9sZSI6IkNvcnJldG9yIGRlIEltw7N2ZWlzIn0sInJvbGUiOiJhdXRoZW50aWNhdGVkIiwiYWFsIjoiYWFsMSIsImFtciI6W3sibWV0aG9kIjoicGFzc3dvcmQiLCJ0aW1lc3RhbXAiOjE3OTAyOTUyNDB9XSwic2Vzc2lvbl9pZCI6ImFmODBiNzkwLWQ2NWItNDFiNS1iZGZmLWZiNzU3MDJlYWM4ZCIsImlzX2Fub255bW91cyI6ZmFsc2V9.ktJc4dxmbgTu_47qZATWhRUu7lPbdAdxK36fvf-do5we1hN7HEBD6uoE5ELOLBJlluI6HerNkXsmfXna8m6gTg';

const BASE_URL = 'http://localhost:3001/api/matches';

describe('Auditoria de Segurança — /api/matches', () => {
  // 1. GET sem Authorization -> 401
  it('1. Deve rejeitar GET sem cabeçalho Authorization com 401', async () => {
    const res = await fetch(BASE_URL);
    assert.strictEqual(res.status, 401, 'Deveria retornar 401');
    const data = await res.json();
    assert.match(data.error, /Token de autenticação não fornecido/i);
  });

  // 2. GET com JWT inválido -> 401
  it('2. Deve rejeitar GET com JWT inválido com 401', async () => {
    const res = await fetch(BASE_URL, {
      headers: { Authorization: 'Bearer token-invalido-propositalmente' },
    });
    assert.strictEqual(res.status, 401, 'Deveria retornar 401');
    const data = await res.json();
    assert.match(data.error, /Sessão inválida/i);
  });

  // 3. GET com usuário autenticado de conta não autorizada -> 403
  it('3. Deve rejeitar usuário de conta não autorizada com 403', async () => {
    // Simula contexto onde callerAccountId difere de MEUS_IMOVEIS_ACCOUNT_ID
    const originalAccountId = process.env.MEUS_IMOVEIS_ACCOUNT_ID;
    try {
      process.env.MEUS_IMOVEIS_ACCOUNT_ID = '00000000-0000-0000-0000-000000000000';
      const mockReq = {
        headers: { authorization: `Bearer ${LEGITIMATE_TOKEN}` },
        url: '/api/matches',
        method: 'GET',
      };
      let capturedStatus = 0;
      let capturedBody: any = null;
      const mockRes = {
        statusCode: 0,
        setHeader: () => {},
        end: (bodyStr: string) => {
          capturedStatus = mockRes.statusCode;
          capturedBody = JSON.parse(bodyStr);
        },
      };

      await handleMatches(mockReq as any, mockRes as any);
      assert.strictEqual(capturedStatus, 403, 'Deveria retornar 403 para conta não mapeada');
      assert.match(capturedBody.error, /Acesso não autorizado/i);
    } finally {
      process.env.MEUS_IMOVEIS_ACCOUNT_ID = originalAccountId;
    }
  });

  // 4. GET enviando ?accountId=<outra conta> -> rejeita 400
  it('4. Deve rejeitar GET com accountId arbitrário no query param com 400', async () => {
    const res = await fetch(
      `${BASE_URL}?accountId=f8d2ae51-e393-4a74-a432-ddab0610837e`,
      {
        headers: { Authorization: `Bearer ${LEGITIMATE_TOKEN}` },
      }
    );
    assert.strictEqual(res.status, 400, 'Deveria retornar 400 ao tentar controlar accountId');
    const data = await res.json();
    assert.match(data.error, /não é permitido/i);
  });

  // 5. POST com body.accountId arbitrário -> rejeita 400
  it('5. Deve rejeitar POST com body.accountId com 400', async () => {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LEGITIMATE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'suppress',
        matchId: '11111111-1111-1111-1111-111111111111',
        accountId: '7f434d39-87d8-4d16-8262-e3006908d1c5',
      }),
    });
    assert.strictEqual(res.status, 400, 'Deveria retornar 400 ao enviar accountId no body');
    const data = await res.json();
    assert.match(data.error, /não é permitido no corpo/i);
  });

  // 6. update_status de match pertencente a outra conta -> 404
  it('6. update_status de match inexistente na conta canônica deve retornar 404', async () => {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LEGITIMATE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'update_status',
        matchId: '00000000-0000-0000-0000-000000000000',
        newStatus: 'pausado',
      }),
    });
    assert.strictEqual(res.status, 404, 'Deveria retornar 404');
    const data = await res.json();
    assert.match(data.error, /Match não encontrado na conta autorizada/i);
  });

  // 7. suppress de match de outra conta -> 404
  it('7. suppress de match inexistente na conta canônica deve retornar 404', async () => {
    const res = await fetch(BASE_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LEGITIMATE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'suppress',
        matchId: '00000000-0000-0000-0000-000000000000',
      }),
    });
    assert.strictEqual(res.status, 404, 'Deveria retornar 404');
    const data = await res.json();
    assert.match(data.error, /Match não encontrado na conta autorizada/i);
  });

  // 8. Ausência de MATCH_CANONICAL_ACCOUNT_ID -> fail closed (500)
  it('8. Ausência de MATCH_CANONICAL_ACCOUNT_ID deve falhar fechado com 500', async () => {
    const original = process.env.MATCH_CANONICAL_ACCOUNT_ID;
    try {
      delete process.env.MATCH_CANONICAL_ACCOUNT_ID;
      const mockReq = {
        headers: { authorization: `Bearer ${LEGITIMATE_TOKEN}` },
        url: '/api/matches',
        method: 'GET',
      };
      let capturedStatus = 0;
      let capturedBody: any = null;
      const mockRes = {
        statusCode: 0,
        setHeader: () => {},
        end: (bodyStr: string) => {
          capturedStatus = mockRes.statusCode;
          capturedBody = JSON.parse(bodyStr);
        },
      };

      await handleMatches(mockReq as any, mockRes as any);
      assert.strictEqual(capturedStatus, 500, 'Deveria falhar fechado com status 500');
      assert.match(capturedBody.error, /Configuração do servidor incompleta/i);
    } finally {
      process.env.MATCH_CANONICAL_ACCOUNT_ID = original;
    }
  });

  // 9. Ausência de MEUS_IMOVEIS_ACCOUNT_ID -> fail closed (500)
  it('9. Ausência de MEUS_IMOVEIS_ACCOUNT_ID deve falhar fechado com 500', async () => {
    const original = process.env.MEUS_IMOVEIS_ACCOUNT_ID;
    try {
      delete process.env.MEUS_IMOVEIS_ACCOUNT_ID;
      const mockReq = {
        headers: { authorization: `Bearer ${LEGITIMATE_TOKEN}` },
        url: '/api/matches',
        method: 'GET',
      };
      let capturedStatus = 0;
      let capturedBody: any = null;
      const mockRes = {
        statusCode: 0,
        setHeader: () => {},
        end: (bodyStr: string) => {
          capturedStatus = mockRes.statusCode;
          capturedBody = JSON.parse(bodyStr);
        },
      };

      await handleMatches(mockReq as any, mockRes as any);
      assert.strictEqual(capturedStatus, 500, 'Deveria falhar fechado com status 500');
      assert.match(capturedBody.error, /Configuração do servidor incompleta/i);
    } finally {
      process.env.MEUS_IMOVEIS_ACCOUNT_ID = original;
    }
  });

  // 10. service_role não aparece no bundle frontend
  it('10. SUPABASE_SERVICE_ROLE_KEY não deve constar no bundle compilado de frontend', () => {
    const distAssetsDir = path.resolve('dist', 'assets');
    assert.ok(fs.existsSync(distAssetsDir), 'Diretório dist/assets deve existir');

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    assert.ok(serviceKey, 'SUPABASE_SERVICE_ROLE_KEY deve existir no ambiente de teste');

    const files = fs.readdirSync(distAssetsDir);
    for (const file of files) {
      if (file.endsWith('.js')) {
        const content = fs.readFileSync(path.join(distAssetsDir, file), 'utf-8');
        assert.ok(
          !content.includes(serviceKey),
          `A chave mestra SUPABASE_SERVICE_ROLE_KEY foi encontrada no bundle frontend: ${file}!`
        );
      }
    }
  });

  // 11. Teste Positivo: GET com usuário legítimo autenticado -> 200, 42 matches
  it('11. Usuário legítimo deve receber 200 com exatamente 42 matches canônicos', async () => {
    const res = await fetch(BASE_URL, {
      headers: { Authorization: `Bearer ${LEGITIMATE_TOKEN}` },
    });
    assert.strictEqual(res.status, 200, 'Deveria retornar 200');
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.matches.length, 42, 'Devem ser retornados exatamente 42 matches');

    // Valida TESTE 1 com 100% no Royal Sunset
    const teste1 = data.matches.find(
      (m: any) => m.lead?.name?.includes('TESTE 1') && m.matchScore === 100
    );
    assert.ok(teste1, 'TESTE 1 com 100% deve estar presente');
    assert.match(teste1.property?.title || '', /Royal Sunset/i);

    // Valida TESTE 2 com 69%
    const teste2 = data.matches.find(
      (m: any) => m.lead?.name?.includes('TESTE 2') && m.matchScore === 69
    );
    assert.ok(teste2, 'TESTE 2 com 69% deve estar presente');
  });

  // 12. Teste Positivo: GET com propertyId -> 200 filtrado para a propriedade
  it('12. Consulta por propertyId deve retornar matches restritos à propriedade sob a conta canônica', async () => {
    // Pega o propertyId do Edifício Royal Sunset
    const allRes = await fetch(BASE_URL, {
      headers: { Authorization: `Bearer ${LEGITIMATE_TOKEN}` },
    });
    const allData = await allRes.json();
    const royalSunset = allData.matches.find((m: any) => m.property?.title?.includes('Royal Sunset'));
    assert.ok(royalSunset, 'Royal Sunset deve existir');

    const propId = royalSunset.propertyId;
    const res = await fetch(`${BASE_URL}?propertyId=${propId}`, {
      headers: { Authorization: `Bearer ${LEGITIMATE_TOKEN}` },
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.matches.length, 2, 'Royal Sunset possui 2 matches (TESTE 1 e TESTE 2)');
    for (const m of data.matches) {
      assert.strictEqual(m.propertyId, propId);
    }
  });
});
