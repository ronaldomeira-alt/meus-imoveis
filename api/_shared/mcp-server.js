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
        incluir_internos: {
          type: 'boolean',
          default: false,
          description: 'Se true, inclui os dados confidenciais (construtora, contato, observação interna) agrupados no objeto interno (padrão: false)',
        },
        incluir_testes: {
          type: 'boolean',
          default: false,
          description: 'Se true, inclui registros marcados como teste técnico na busca (padrão: false)',
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
          type: ['string', 'null'],
          description: 'Título público exibido ao cliente (opcional; se omitido ou null, permanece null)',
        },
        origem: {
          type: ['string', 'null'],
          enum: ['proprio', 'parceiro', 'construtora', null],
          default: 'construtora',
          description: 'Origem do imóvel no CRM: proprio, parceiro ou construtora (padrão MCP: construtora)',
        },
        condicao: {
          type: ['string', 'null'],
          enum: ['novo', 'usado', 'na_planta', null],
          default: 'novo',
          description: 'Condição do imóvel: novo, usado ou na_planta (padrão: novo quando origem = construtora)',
        },
        construtora: {
          type: ['string', 'null'],
          description: 'Nome da construtora ou incorporadora parceira (interno, confidencial ao corretor)',
        },
        contato_construtora: {
          type: ['string', 'null'],
          description: 'Nome e telefone/WhatsApp de contato da construtora (estritamente interno e confidencial)',
        },
        bairro: {
          type: ['string', 'null'],
          description: 'Bairro do empreendimento (ex: "Cabo Branco", "Altiplano")',
        },
        cidade: {
          type: ['string', 'null'],
          default: 'João Pessoa',
          description: 'Cidade do empreendimento. Padrão: "João Pessoa"',
        },
        endereco: {
          type: ['string', 'null'],
          description: 'Endereço PÚBLICO do imóvel (apenas bairro e cidade, sem número)',
        },
        endereco_completo: {
          type: ['string', 'null'],
          description: 'Endereço INTERNO da construtora com rua, número e complemento (estritamente confidencial, ou null)',
        },
        status: {
          type: ['string', 'null'],
          enum: ['lancamento', 'em_construcao', 'pronto', 'pre_lancamento', null],
          description: 'Fase da obra: lancamento, em_construcao, pronto ou pre_lancamento',
        },
        entrega: {
          type: ['string', 'null'],
          description: 'Previsão de entrega da obra no formato AAAA-MM (ex: "2027-12")',
        },
        preco_a_partir_de: {
          type: ['number', 'null'],
          description: 'Valor inicial de venda em reais (ex: 350000.00, ou null)',
        },
        area_min_m2: {
          type: ['number', 'null'],
          description: 'Metragem mínima em m² (ex: 28.5, aceita null se não informada)',
        },
        area_max_m2: {
          type: ['number', 'null'],
          description: 'Metragem máxima em m² (ex: 85.0, aceita null se não informada)',
        },
        quartos_min: {
          type: ['integer', 'null'],
          description: 'Menor número de quartos disponível (ex: 1 ou 0 para studio, ou null)',
        },
        quartos_max: {
          type: ['integer', 'null'],
          description: 'Maior número de quartos disponível (ex: 3, ou null)',
        },
        suites: {
          type: ['integer', 'null'],
          description: 'Quantidade de suítes (ou null)',
        },
        banheiros: {
          type: ['integer', 'null'],
          description: 'Quantidade de banheiros (ou null)',
        },
        vagas: {
          type: ['integer', 'null'],
          description: 'Quantidade de vagas de garagem (se omitido ou null, permanece null "não informado", nunca 0)',
        },
        posicao: {
          type: ['string', 'null'],
          description: 'Posição solar/vento (ex: "Nascente Norte", "Poente", ou null)',
        },
        descricao: {
          type: ['string', 'null'],
          description: 'Texto descritivo comercial do empreendimento, book ou memorial',
        },
        observacao: {
          type: ['string', 'null'],
          description: 'Observação ou notas gerais sobre o empreendimento',
        },
        observacao_interna: {
          type: ['string', 'null'],
          description: 'Notas estritamente internas e confidenciais: alertas, comissão, regras de visita, origem dos dados (nunca exibido ao cliente)',
        },
        diferenciais: {
          type: 'array',
          items: { type: 'string' },
          description: 'Lista de itens de lazer e diferenciais (ex: ["Piscina infinita", "Rooftop", "Academia"])',
        },
        link_tabela: {
          type: ['string', 'null'],
          description: 'Link público ou Drive para a tabela de preços/espelho de vendas (interno)',
        },
        link_pasta: {
          type: ['string', 'null'],
          description: 'Link da pasta do Google Drive/Dropbox com os materiais da construtora (interno)',
        },
        data_tabela: {
          type: ['string', 'null'],
          description: 'Mês ou data de referência da tabela de preços (ex: "Outubro/2026", ou null)',
        },
        ativo: {
          type: ['boolean', 'null'],
          default: true,
          description: 'Se o empreendimento está ativo no catálogo (true) ou arquivado (false)',
        },
        is_teste: {
          type: 'boolean',
          default: false,
          description: 'Se true, marca o empreendimento como registro de teste técnico (padrão: false). Registros de teste nunca são exibidos no estoque, site ou redes sociais.',
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
              chave_externa: { type: 'string', description: 'Chave externa única do empreendimento' },
              nome: { type: 'string', description: 'Nome comercial do empreendimento' },
              nome_publico: { type: ['string', 'null'], description: 'Título público para clientes (opcional, ou null)' },
              origem: { type: ['string', 'null'], enum: ['proprio', 'parceiro', 'construtora', null], description: 'Origem no CRM (padrão: construtora)' },
              condicao: { type: ['string', 'null'], enum: ['novo', 'usado', 'na_planta', null], description: 'Condição do imóvel (padrão: novo)' },
              construtora: { type: ['string', 'null'], description: 'Nome da construtora (interno/confidencial)' },
              contato_construtora: { type: ['string', 'null'], description: 'Nome/telefone de contato na construtora (interno/confidencial)' },
              bairro: { type: ['string', 'null'], description: 'Bairro do empreendimento' },
              cidade: { type: ['string', 'null'], description: 'Cidade do empreendimento' },
              endereco: { type: ['string', 'null'], description: 'Endereço PÚBLICO do imóvel (apenas bairro e cidade, sem número)' },
              endereco_completo: { type: ['string', 'null'], description: 'Endereço INTERNO da construtora com rua, número e complemento (estritamente confidencial, ou null)' },
              status: { type: ['string', 'null'], enum: ['lancamento', 'em_construcao', 'pronto', 'pre_lancamento', null] },
              entrega: { type: ['string', 'null'], description: 'Previsão de entrega AAAA-MM' },
              preco_a_partir_de: { type: ['number', 'null'], description: 'Preço a partir de (ou null)' },
              area_min_m2: { type: ['number', 'null'], description: 'Metragem mínima em m² (ou null)' },
              area_max_m2: { type: ['number', 'null'], description: 'Metragem máxima em m² (ou null)' },
              quartos_min: { type: ['integer', 'null'], description: 'Menor número de quartos (ou null)' },
              quartos_max: { type: ['integer', 'null'], description: 'Maior número de quartos (ou null)' },
              suites: { type: ['integer', 'null'] },
              banheiros: { type: ['integer', 'null'] },
              vagas: { type: ['integer', 'null'], description: 'Vagas de garagem (null se não informado)' },
              posicao: { type: ['string', 'null'], description: 'Posição solar/vento' },
              descricao: { type: ['string', 'null'], description: 'Texto descritivo comercial' },
              observacao: { type: ['string', 'null'], description: 'Observação ou notas gerais' },
              observacao_interna: { type: ['string', 'null'], description: 'Observação interna confidencial (nunca exibido ao cliente)' },
              diferenciais: { type: 'array', items: { type: 'string' } },
              link_tabela: { type: ['string', 'null'] },
              link_pasta: { type: ['string', 'null'] },
              data_tabela: { type: ['string', 'null'] },
              ativo: { type: ['boolean', 'null'] },
              is_teste: { type: 'boolean', default: false, description: 'Se true, marca o empreendimento como teste técnico (padrão: false)' },
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
      'Baixa uma imagem a partir de uma URL pública (converte automaticamente links do Google Drive e Dropbox), valida dimensões mínimas (400x300 px), qualidade de cor (rejeita fotos monocromáticas), formatos JPG/PNG/WEBP até 15MB, deduplica por hash SHA-256, salva no storage do CRM e vincula ao empreendimento.',
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
      'Envia até 30 fotos em lote para um empreendimento. Processa em série no servidor com lock atômico por empreendimento, baixando cada URL (Google Drive e Dropbox convertidos para download direto), validando dimensões mínimas (400x300 px), qualidade de cor (rejeita fotos monocromáticas) e formatos JPG/PNG/WEBP até 15MB, deduplicando por SHA-256 e gravando no R2. Se capa=true em alguma foto, define como capa ao final.',
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
      'Adiciona uma foto diretamente enviando os bytes em Base64. Valida dimensões mínimas (400x300 px), qualidade de cor (rejeita imagens monocromáticas), tamanho e tipo (JPG/PNG/WEBP até 15MB), deduplica por hash, salva no storage e vincula ao empreendimento.',
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
                type: ['string', 'null'],
                description: 'Número ou identificador da unidade (ex: "402", "101-B")',
              },
              torre_bloco: {
                type: ['string', 'null'],
                description: 'Torre ou bloco (ex: "Torre A", "Bloco 2")',
              },
              tipo: {
                type: ['string', 'null'],
                description: 'Tipo da unidade (ex: "Apartamento", "Studio", "Cobertura")',
              },
              quartos: {
                type: ['integer', 'null'],
                description: 'Número de quartos (ou null)',
              },
              suites: {
                type: ['integer', 'null'],
                description: 'Número de suítes (ou null)',
              },
              banheiros: {
                type: ['integer', 'null'],
                description: 'Número de banheiros (ou null)',
              },
              vagas: {
                type: ['integer', 'null'],
                description: 'Quantidade de vagas de garagem (ou null)',
              },
              andar: {
                type: ['integer', 'null'],
                description: 'Andar da unidade (ex: 4, ou null)',
              },
              mobiliado: {
                type: ['boolean', 'null'],
                description: 'Se a unidade é mobiliada (true/false ou null)',
              },
              posicao: {
                type: ['string', 'null'],
                description: 'Posição solar/vento (ex: "Nascente Norte", "Poente", ou null)',
              },
              area_m2: {
                type: ['number', 'null'],
                description: 'Área privativa em m² (aceita null se não informada)',
              },
              metragem_texto: {
                type: ['string', 'null'],
                description: 'Texto de metragem (ex: "54.80m²", ou null)',
              },
              preco: {
                type: ['number', 'null'],
                description: 'Preço da unidade em reais (aceita null se não informado)',
              },
              sinal: {
                type: ['number', 'null'],
                description: 'Valor de entrada/sinal (aceita null)',
              },
              parcela: {
                type: ['number', 'null'],
                description: 'Valor da parcela mensal (aceita null)',
              },
              status: {
                type: ['string', 'null'],
                enum: ['disponivel', 'reservada', 'vendida', null],
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
  if (typeof res.status === 'function' && typeof res.json === 'function') {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
    res.setHeader('CDN-Cache-Control', 'no-store');
    res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
    return res.status(status).json(obj);
  }

  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');
  res.end(JSON.stringify(obj));
}

/**
 * Handler principal do MCP Server sobre HTTP Streamable / JSON-RPC 2.0
 */
export async function handleMcpServer(req, res) {
  // CORS universal e no-store
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, Accept');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.setHeader('Vercel-CDN-Cache-Control', 'no-store');

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

  // Suporte a handshake GET (exibe status, ferramentas disponíveis e catálogo completo)
  if (req.method === 'GET') {
    const isSse = (req.headers['accept'] || '').includes('text/event-stream');
    if (isSse) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store',
        Connection: 'keep-alive',
      });
      res.write(`event: endpoint\ndata: ${req.url}\n\n`);
      return;
    }

    return sendJson(res, 200, {
      name: 'meus-imoveis-mcp',
      version: '1.2.1',
      protocol: 'mcp-jsonrpc-2.0',
      status: 'online',
      tools_available: MCP_TOOLS_DEFINITIONS.length,
      tools: MCP_TOOLS_DEFINITIONS,
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
              tools: { listChanged: true },
            },
            serverInfo: {
              name: 'meus-imoveis-mcp',
              version: '1.2.1',
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

      case 'tools/list':
      case 'list_tools':
      case 'listTools':
      case 'tools.list':
      case 'mcp.tools/list': {
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
