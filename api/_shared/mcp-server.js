import * as tools from './mcp-tools.js';

// Schemas JSON Schema para as 10 ferramentas do MCP
export const MCP_TOOLS_DEFINITIONS = [
  {
    name: 'buscar_empreendimentos',
    description:
      'Busca empreendimentos e imóveis no catálogo do CRM por texto (nome, construtora, bairro, chave_externa) sem diferenciar maiúsculas ou acentos. Retorna lista com metadados básicos e contagem para evitar cadastros duplicados.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: {
          type: 'string',
          description: 'Termo de busca textual geral (ex: "Horizonte", "Alliance")',
        },
        construtora: {
          type: 'string',
          description: 'Filtro específico por nome da construtora ou parceiro',
        },
        bairro: {
          type: 'string',
          description: 'Filtro específico por bairro (ex: "Cabo Branco", "Bessa")',
        },
        limite: {
          type: 'integer',
          default: 20,
          description: 'Quantidade máxima de resultados a retornar (1 a 100). Padrão: 20',
        },
        offset: {
          type: 'integer',
          default: 0,
          description: 'Deslocamento para paginação (0, 20, 40...). Padrão: 0',
        },
      },
    },
  },
  {
    name: 'obter_empreendimento',
    description:
      'Retorna a ficha completa de um empreendimento, incluindo fotos, unidades, diferenciais, links de tabela e contagens, usando o ID interno do CRM ou a chave_externa.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'ID interno do empreendimento no CRM (ex: "dev-...")',
        },
        chave_externa: {
          type: 'string',
          description: 'Chave externa única informada na criação (ex: "alliance-infinity-ocean")',
        },
      },
    },
  },
  {
    name: 'upsert_empreendimento',
    description:
      'Cria ou atualiza um empreendimento no CRM. Idempotente por "chave_externa". Se já existir, faz merge dos campos informados sem apagar campos ou fotos pré-existentes.',
    inputSchema: {
      type: 'object',
      required: ['chave_externa'],
      properties: {
        chave_externa: {
          type: 'string',
          description: 'Identificador único do empreendimento fornecido pelo bot (obrigatório, garante idempotência)',
        },
        nome: {
          type: 'string',
          description: 'Nome comercial do empreendimento (obrigatório no cadastro, mantido interno)',
        },
        nome_publico: {
          type: 'string',
          description: 'Título público exibido ao cliente (opcional; se omitido, gera título genérico como "Apartamento 2 quartos no Bessa")',
        },
        origem: {
          type: 'string',
          enum: ['proprio', 'parceiro', 'construtora'],
          default: 'construtora',
          description: 'Origem do imóvel no CRM: proprio, parceiro ou construtora (padrão MCP: construtora)',
        },
        condicao: {
          type: 'string',
          enum: ['novo', 'usado', 'na_planta'],
          default: 'novo',
          description: 'Condição do imóvel: novo, usado ou na_planta (padrão: novo quando origem = construtora)',
        },
        construtora: {
          type: 'string',
          description: 'Nome da construtora ou incorporadora parceira (exibido no quadro confidencial)',
        },
        contato_construtora: {
          type: 'string',
          description: 'Nome e telefone/WhatsApp de contato da construtora para visitas/tabela (estritamente confidencial)',
        },
        bairro: {
          type: 'string',
          description: 'Bairro do empreendimento (ex: "Cabo Branco", "Altiplano")',
        },
        cidade: {
          type: 'string',
          default: 'João Pessoa',
          description: 'Cidade do empreendimento. Padrão: "João Pessoa"',
        },
        endereco: {
          type: 'string',
          description: 'Endereço completo com rua e número (armazenado internamente, nunca exibido com número na visão pública)',
        },
        endereco_completo: {
          type: 'string',
          description: 'Endereço completo com rua e número (estritamente interno)',
        },
        status: {
          type: 'string',
          enum: ['lancamento', 'em_construcao', 'pronto', 'pre_lancamento'],
          description: 'Fase da obra: lancamento, em_construcao, pronto ou pre_lancamento',
        },
        entrega: {
          type: 'string',
          description: 'Previsão de entrega da obra no formato AAAA-MM (ex: "2027-12")',
        },
        preco_a_partir_de: {
          type: 'number',
          description: 'Valor inicial de venda em reais (ex: 350000.00)',
        },
        area_min_m2: {
          type: 'number',
          description: 'Metragem mínima em m² (ex: 28.5)',
        },
        area_max_m2: {
          type: 'number',
          description: 'Metragem máxima em m² (ex: 85.0)',
        },
        quartos_min: {
          type: 'integer',
          description: 'Menor número de quartos disponível (ex: 1 ou 0 para studio)',
        },
        quartos_max: {
          type: 'integer',
          description: 'Maior número de quartos disponível (ex: 3)',
        },
        suites: {
          type: 'integer',
          description: 'Quantidade de suítes',
        },
        banheiros: {
          type: 'integer',
          description: 'Quantidade de banheiros',
        },
        vagas: {
          type: 'integer',
          description: 'Quantidade de vagas de garagem (se omitido ou null, permanece null "não informado", nunca 0)',
        },
        posicao: {
          type: 'string',
          description: 'Posição solar/vento (ex: "Nascente Norte", "Poente")',
        },
        descricao: {
          type: 'string',
          description: 'Texto descritivo comercial do empreendimento, book ou memorial',
        },
        observacao: {
          type: 'string',
          description: 'Observação ou notas de uso estritamente interno da imobiliária (NÃO exibido ao cliente)',
        },
        observacao_interna: {
          type: 'string',
          description: 'Notas internas confidenciais: alertas, comissão, regras de visita, origem dos dados',
        },
        diferenciais: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista de itens de lazer e diferenciais (ex: ["Piscina infinita", "Rooftop", "Academia"])',
        },
        link_tabela: {
          type: 'string',
          description: 'Link público ou Drive para a tabela de preços/espelho de vendas',
        },
        link_pasta: {
          type: 'string',
          description: 'Link da pasta do Google Drive/Dropbox com os materiais da construtora',
        },
        data_tabela: {
          type: 'string',
          description: 'Mês ou data de referência da tabela de preços (ex: "Outubro/2026" ou "2026-10")',
        },
        ativo: {
          type: 'boolean',
          default: true,
          description: 'Se o empreendimento está ativo no catálogo (true) ou arquivado (false)',
        },
      },
    },
  },
  {
    name: 'upsert_empreendimentos_lote',
    description:
      'Cadastra ou atualiza uma lista de até 50 empreendimentos em lote com idempotência por chave_externa. Retorna resultado detalhado por item.',
    inputSchema: {
      type: 'object',
      required: ['itens'],
      properties: {
        itens: {
          type: 'array',
          items: {
            type: 'object',
            required: ['chave_externa'],
            properties: {
              chave_externa: { type: 'string' },
              nome: { type: 'string' },
              nome_publico: { type: 'string' },
              origem: { type: 'string', enum: ['proprio', 'parceiro', 'construtora'] },
              condicao: { type: 'string', enum: ['novo', 'usado', 'na_planta'] },
              construtora: { type: 'string' },
              contato_construtora: { type: 'string' },
              bairro: { type: 'string' },
              cidade: { type: 'string' },
              endereco: { type: 'string' },
              endereco_completo: { type: 'string' },
              status: { type: 'string' },
              entrega: { type: 'string' },
              preco_a_partir_de: { type: 'number' },
              area_min_m2: { type: 'number' },
              area_max_m2: { type: 'number' },
              quartos_min: { type: 'integer' },
              quartos_max: { type: 'integer' },
              suites: { type: 'integer' },
              banheiros: { type: 'integer' },
              vagas: { type: 'integer' },
              posicao: { type: 'string' },
              descricao: { type: 'string' },
              observacao: { type: 'string' },
              observacao_interna: { type: 'string' },
              diferenciais: { type: 'array', items: { type: 'string' } },
              link_tabela: { type: 'string' },
              link_pasta: { type: 'string' },
              data_tabela: { type: 'string' },
              ativo: { type: 'boolean' },
            },
          },
          description: 'Lista de empreendimentos para processar (máximo 50 itens)',
        },
      },
    },
  },
  {
    name: 'adicionar_foto',
    description:
      'Baixa uma imagem a partir de uma URL pública (converte automaticamente links do Google Drive e Dropbox), valida (JPG/PNG/WEBP até 15MB), deduplica por hash SHA-256, salva no storage do CRM e vincula ao empreendimento.',
    inputSchema: {
      type: 'object',
      required: ['url'],
      properties: {
        empreendimento_id: {
          type: 'string',
          description: 'ID interno do empreendimento no CRM',
        },
        chave_externa: {
          type: 'string',
          description: 'Chave externa do empreendimento (alternativa ao ID)',
        },
        url: {
          type: 'string',
          description: 'URL pública da imagem (aceita links normais, Google Drive e Dropbox)',
        },
        legenda: {
          type: 'string',
          description: 'Legenda da foto (ex: "Piscina na cobertura", "Fachada diurna")',
        },
        ordem: {
          type: 'integer',
          description: 'Posição de ordenação da foto na galeria (0, 1, 2...)',
        },
        capa: {
          type: 'boolean',
          default: false,
          description: 'Se true, define esta foto como a capa principal do empreendimento',
        },
      },
    },
  },
  {
    name: 'adicionar_fotos_lote',
    description:
      'Envia até 30 fotos em lote para um empreendimento. Processa em série no servidor com lock atômico por empreendimento, baixando cada URL (Google Drive e Dropbox convertidos para download direto), validando formato/tamanho, deduplicando por SHA-256 e gravando no R2. Se capa=true em alguma foto, define como capa ao final.',
    inputSchema: {
      type: 'object',
      required: ['fotos'],
      properties: {
        empreendimento_id: {
          type: 'string',
          description: 'ID interno do empreendimento no CRM',
        },
        chave_externa: {
          type: 'string',
          description: 'Chave externa do empreendimento',
        },
        fotos: {
          type: 'array',
          description: 'Lista de fotos a processar (máximo 30 fotos)',
          items: {
            type: 'object',
            required: ['url'],
            properties: {
              url: {
                type: 'string',
                description: 'URL pública da imagem (ou Drive, Dropbox, Data URI)',
              },
              legenda: {
                type: 'string',
                description: 'Legenda opcional da foto',
              },
              ordem: {
                type: 'integer',
                description: 'Ordem de exibição na galeria',
              },
              capa: {
                type: 'boolean',
                default: false,
                description: 'Se true, define esta foto como capa',
              },
            },
          },
        },
      },
    },
  },
  {
    name: 'adicionar_foto_base64',
    description:
      'Adiciona uma foto diretamente enviando os bytes em Base64. Valida tamanho e tipo, deduplica por hash, salva no storage e vincula ao empreendimento.',
    inputSchema: {
      type: 'object',
      required: ['base64'],
      properties: {
        empreendimento_id: {
          type: 'string',
          description: 'ID interno do empreendimento no CRM',
        },
        chave_externa: {
          type: 'string',
          description: 'Chave externa do empreendimento',
        },
        nome_arquivo: {
          type: 'string',
          default: 'foto.jpg',
          description: 'Nome do arquivo original (ex: "fachada.jpg")',
        },
        base64: {
          type: 'string',
          description: 'Conteúdo do arquivo codificado em Base64',
        },
        legenda: {
          type: 'string',
          description: 'Legenda opcional da foto',
        },
        ordem: {
          type: 'integer',
          description: 'Posição de exibição na galeria',
        },
        capa: {
          type: 'boolean',
          default: false,
          description: 'Se true, define como foto de capa',
        },
      },
    },
  },
  {
    name: 'listar_fotos',
    description:
      'Lista todas as fotos cadastradas de um empreendimento, incluindo id, url, legenda, ordem e se é capa.',
    inputSchema: {
      type: 'object',
      properties: {
        empreendimento_id: {
          type: 'string',
          description: 'ID interno do empreendimento no CRM',
        },
        chave_externa: {
          type: 'string',
          description: 'Chave externa do empreendimento',
        },
      },
    },
  },
  {
    name: 'remover_foto',
    description:
      'Remove uma foto do empreendimento pelo ID da foto. Se a foto for capa, promove a próxima automaticamente.',
    inputSchema: {
      type: 'object',
      required: ['foto_id'],
      properties: {
        foto_id: {
          type: 'string',
          description: 'ID da foto a ser removida',
        },
        empreendimento_id: {
          type: 'string',
          description: 'ID do empreendimento (opcional, acelera a localização)',
        },
      },
    },
  },
  {
    name: 'definir_capa',
    description:
      'Define uma foto específica como capa principal do empreendimento, desmarcando as outras.',
    inputSchema: {
      type: 'object',
      required: ['foto_id'],
      properties: {
        foto_id: {
          type: 'string',
          description: 'ID da foto a ser definida como capa',
        },
        empreendimento_id: {
          type: 'string',
          description: 'ID do empreendimento (opcional)',
        },
      },
    },
  },
  {
    name: 'upsert_unidades_lote',
    description:
      'Cria ou atualiza uma lista de até 200 unidades em um empreendimento, com idempotência por chave_externa da unidade.',
    inputSchema: {
      type: 'object',
      required: ['unidades'],
      properties: {
        empreendimento_id: {
          type: 'string',
          description: 'ID interno do empreendimento no CRM',
        },
        chave_externa: {
          type: 'string',
          description: 'Chave externa do empreendimento',
        },
        unidades: {
          type: 'array',
          description: 'Lista de unidades para criar ou atualizar (máximo 200)',
          items: {
            type: 'object',
            required: ['chave_externa'],
            properties: {
              chave_externa: {
                type: 'string',
                description: 'Identificador único da unidade (ex: "torre-a-apto-402")',
              },
              unidade: {
                type: 'string',
                description: 'Número ou identificador da unidade (ex: "402", "101-B")',
              },
              torre_bloco: {
                type: 'string',
                description: 'Torre ou bloco (ex: "Torre A", "Bloco 2")',
              },
              tipo: {
                type: 'string',
                description: 'Tipo da unidade (ex: "Apartamento", "Studio", "Cobertura")',
              },
              quartos: {
                type: 'integer',
                description: 'Número de quartos',
              },
              suites: {
                type: 'integer',
                description: 'Número de suítes',
              },
              banheiros: {
                type: 'integer',
                description: 'Número de banheiros',
              },
              vagas: {
                type: 'integer',
                description: 'Quantidade de vagas de garagem',
              },
              andar: {
                type: 'integer',
                description: 'Andar da unidade (ex: 4)',
              },
              mobiliado: {
                type: 'boolean',
                description: 'Se a unidade é mobiliada (true/false)',
              },
              posicao: {
                type: 'string',
                description: 'Posição solar/vento (ex: "Nascente Norte", "Poente")',
              },
              area_m2: {
                type: 'number',
                description: 'Área privativa em m²',
              },
              metragem_texto: {
                type: 'string',
                description: 'Texto de metragem (ex: "54.80m²")',
              },
              preco: {
                type: 'number',
                description: 'Preço da unidade em reais (ex: 480000.00)',
              },
              sinal: {
                type: 'number',
                description: 'Valor de entrada/sinal',
              },
              parcela: {
                type: 'number',
                description: 'Valor da parcela mensal',
              },
              status: {
                type: 'string',
                enum: ['disponivel', 'reservada', 'vendida'],
                default: 'disponivel',
                description: 'Status comercial da unidade: disponivel, reservada ou vendida',
              },
            },
          },
        },
      },
    },
  },
  {
    name: 'marcar_unidades_status',
    description:
      'Atualiza o status comercial de múltiplas unidades de uma vez (ex: marcar unidades vendidas ou reservadas ao atualizar tabela de espelho).',
    inputSchema: {
      type: 'object',
      required: ['chaves_externas', 'status'],
      properties: {
        empreendimento_id: {
          type: 'string',
          description: 'ID interno do empreendimento no CRM',
        },
        chave_externa: {
          type: 'string',
          description: 'Chave externa do empreendimento',
        },
        chaves_externas: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista de chaves_externas das unidades a atualizar',
        },
        status: {
          type: 'string',
          enum: ['disponivel', 'reservada', 'vendida'],
          description: 'Novo status comercial: disponivel, reservada ou vendida',
        },
      },
    },
  },
  {
    name: 'desativar_empreendimento',
    description:
      'Desativa um empreendimento com segurança (soft delete: ativo=false, status="Arquivado"). Nunca apaga do banco, preservando histórico e integridade.',
    inputSchema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
          description: 'ID interno do empreendimento',
        },
        chave_externa: {
          type: 'string',
          description: 'Chave externa do empreendimento',
        },
        motivo: {
          type: 'string',
          default: 'Desativado via MCP',
          description: 'Motivo da desativação (ex: "100% vendido", "Lançamento cancelado")',
        },
      },
    },
  },
];

/**
 * Validação do token de segurança Bearer
 */
function validateAuthToken(req) {
  const configuredToken = (process.env.CRM_MCP_TOKEN || 'mcp_sec_7a9f82d4c01e68b31a54b9d0e12f').trim();

  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token === configuredToken) return { authorized: true };
  }

  // Suporte alternativo a query param ?token= (para handshake SSE ou webhooks)
  try {
    const url = new URL(req.url, 'http://localhost');
    const qToken = url.searchParams.get('token');
    if (qToken && qToken === configuredToken) return { authorized: true };
  } catch {}

  return {
    authorized: false,
    status: 401,
    error: 'Não autorizado. Cabeçalho "Authorization: Bearer <CRM_MCP_TOKEN>" ausente ou inválido.',
  };
}

/**
 * Executa uma chamada de ferramenta MCP
 */
async function executeToolCall(toolName, args = {}) {
  switch (toolName) {
    case 'buscar_empreendimentos':
      return await tools.buscarEmpreendimentos(args);
    case 'obter_empreendimento':
      return await tools.obterEmpreendimento(args);
    case 'upsert_empreendimento':
      return await tools.upsertEmpreendimento(args);
    case 'upsert_empreendimentos_lote':
      return await tools.upsertEmpreendimentosLote(args);
    case 'adicionar_foto':
      return await tools.adicionarFoto(args);
    case 'adicionar_fotos_lote':
      return await tools.adicionarFotosLote(args);
    case 'adicionar_foto_base64':
      return await tools.adicionarFotoBase64(args);
    case 'listar_fotos':
      return await tools.listarFotos(args);
    case 'remover_foto':
      return await tools.removerFoto(args);
    case 'definir_capa':
      return await tools.definirCapa(args);
    case 'upsert_unidades_lote':
      return await tools.upsertUnidadesLote(args);
    case 'marcar_unidades_status':
      return await tools.marcarUnidadesStatus(args);
    case 'desativar_empreendimento':
      return await tools.desativarEmpreendimento(args);
    default:
      throw new Error(`Ferramenta desconhecida: "${toolName}".`);
  }
}

function sendJson(res, status, obj) {
  const jsonStr = JSON.stringify(obj);
  const buf = Buffer.from(jsonStr, 'utf-8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
  });
  res.end(buf);
}

/**
 * Handler principal do MCP Server sobre HTTP Streamable / JSON-RPC 2.0
 */
export async function handleMcpServer(req, res) {
  // CORS universal
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  // Validação de token Bearer
  const auth = validateAuthToken(req);
  if (!auth.authorized) {
    return sendJson(res, auth.status, {
      jsonrpc: '2.0',
      error: { code: -32001, message: auth.error },
    });
  }

  // Suporte a handshake GET (exibe status e informações do MCP)
  if (req.method === 'GET') {
    const isSse = (req.headers['accept'] || '').includes('text/event-stream');
    if (isSse) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });
      res.write(`event: endpoint\ndata: ${req.url}\n\n`);
      return;
    }

    return sendJson(res, 200, {
      name: 'meus-imoveis-mcp',
      version: '1.0.0',
      protocol: 'mcp-jsonrpc-2.0',
      status: 'online',
      tools_available: MCP_TOOLS_DEFINITIONS.length,
    });
  }

  if (req.method !== 'POST') {
    return sendJson(res, 405, {
      jsonrpc: '2.0',
      error: { code: -32600, message: 'Método não permitido.' },
    });
  }

  // Lê body da requisição com suporte nativo a Vercel body parser
  let body = null;
  try {
    if (req.body && typeof req.body === 'object') {
      body = req.body;
    } else if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      body = raw ? JSON.parse(raw) : {};
    }
  } catch (err) {
    return sendJson(res, 400, {
      jsonrpc: '2.0',
      error: { code: -32700, message: `Parse error: JSON inválido. ${err.message}` },
    });
  }

  const { jsonrpc = '2.0', id, method, params = {} } = body;

  // Trata métodos padrão do MCP
  try {
    switch (method) {
      case 'initialize': {
        return sendJson(res, 200, {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: { listChanged: false },
            },
            serverInfo: {
              name: 'meus-imoveis-mcp',
              version: '1.0.0',
            },
          },
        });
      }

      case 'notifications/initialized': {
        return sendJson(res, 200, { jsonrpc: '2.0' });
      }

      case 'ping': {
        return sendJson(res, 200, { jsonrpc: '2.0', id, result: {} });
      }

      case 'tools/list': {
        return sendJson(res, 200, {
          jsonrpc: '2.0',
          id,
          result: {
            tools: MCP_TOOLS_DEFINITIONS,
          },
        });
      }

      case 'tools/call': {
        const { name: toolName, arguments: args } = params;
        if (!toolName) {
          return sendJson(res, 400, {
            jsonrpc: '2.0',
            id,
            error: { code: -32602, message: 'Parâmetro "name" da ferramenta ausente em tools/call.' },
          });
        }

        try {
          const result = await executeToolCall(toolName, args || {});
          return sendJson(res, 200, {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify(result, null, 2),
                },
              ],
              isError: false,
            },
          });
        } catch (toolError) {
          return sendJson(res, 200, {
            jsonrpc: '2.0',
            id,
            result: {
              content: [
                {
                  type: 'text',
                  text: `Erro na execução de ${toolName}: ${toolError.message}`,
                },
              ],
              isError: true,
            },
          });
        }
      }

      default: {
        // Fallback: se o cliente chamar o nome da ferramenta diretamente como "method"
        const toolMatch = MCP_TOOLS_DEFINITIONS.find((t) => t.name === method);
        if (toolMatch) {
          try {
            const result = await executeToolCall(method, params);
            return sendJson(res, 200, { jsonrpc: '2.0', id, result });
          } catch (execErr) {
            return sendJson(res, 200, { jsonrpc: '2.0', id, error: { code: -32000, message: execErr.message } });
          }
        }

        return sendJson(res, 404, {
          jsonrpc: '2.0',
          id,
          error: { code: -32601, message: `Método MCP não encontrado: "${method}".` },
        });
      }
    }
  } catch (serverErr) {
    console.error('[MCP Server Error]', serverErr);
    return sendJson(res, 500, {
      jsonrpc: '2.0',
      id,
      error: { code: -32603, message: `Erro interno no servidor MCP: ${serverErr.message}` },
    });
  }
}
