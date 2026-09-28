import * as pdfjsLib from 'pdfjs-dist';

// Configura o worker do PDF.js via CDN para evitar problemas de bundling do worker em navegadores
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`;
}

export interface DocumentParseResult {
  success: boolean;
  text?: string;
  totalPages?: number;
  extractedPages?: number;
  isScanned?: boolean;
  message?: string;
}

const REAL_ESTATE_KEYWORDS = [
  'm²',
  'm2',
  'metro',
  'área',
  'area',
  'quarto',
  'suite',
  'suíte',
  'banheiro',
  'vaga',
  'garagem',
  'preço',
  'preco',
  'valor',
  'r$',
  'a partir',
  'sinal',
  'parcela',
  'tabela',
  'condomínio',
  'condominio',
  'iptu',
  'entrega',
  'previsão',
  'obra',
  'estágio',
  'lançamento',
  'lancamento',
  'incorporação',
  'incorporacao',
  'ri',
  'r-',
  'bairro',
  'localização',
  'endereço',
  'planta',
  'tipologia',
  'tipo',
  'studio',
  'apartamento',
  'cobertura',
  'lazer',
  'piscina',
  'academia',
  'gourmet',
  'rooftop',
  'elevador',
  'memorial',
  'construtora',
];

/**
 * Limpa e seleciona as partes mais ricas e informativas do documento
 * para economizar tokens sem perder nenhum dado essencial da ficha.
 */
export const optimizeTextForTokenBudget = (rawText: string, maxChars = 7000): string => {
  if (!rawText || rawText.trim().length === 0) return '';

  // Quebra por parágrafos/blocos
  const blocks = rawText
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter((b) => b.length > 10);

  if (rawText.length <= maxChars) {
    return rawText.trim();
  }

  // Pontua cada bloco pela densidade de informações imobiliárias
  const scoredBlocks = blocks.map((block) => {
    const lower = block.toLowerCase();
    let score = 0;
    for (const kw of REAL_ESTATE_KEYWORDS) {
      if (lower.includes(kw)) score += 2;
    }
    // Bônus se contiver números e medidas monetárias/de área
    if (/\d+[\s.,]?\d*\s*(?:m²|m2|r\$|mil|milhões|quartos?|vagas?)/i.test(lower)) {
      score += 5;
    }
    return { block, score };
  });

  // Mantém os blocos mais relevantes
  scoredBlocks.sort((a, b) => b.score - a.score);

  let accumulated = '';
  for (const item of scoredBlocks) {
    if ((accumulated + '\n\n' + item.block).length > maxChars) break;
    accumulated += (accumulated ? '\n\n' : '') + item.block;
  }

  return accumulated || rawText.substring(0, maxChars);
};

/**
 * Extrai texto de um arquivo PDF, TXT ou MD no navegador.
 */
export const extractTextFromDocument = async (file: File): Promise<DocumentParseResult> => {
  const fileName = file.name.toLowerCase();

  // Arquivos de texto puro (.txt, .md)
  if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
    try {
      const text = await file.text();
      if (!text || !text.trim()) {
        return {
          success: false,
          message: 'O arquivo de texto enviado está vazio.',
        };
      }
      const optimized = optimizeTextForTokenBudget(text);
      return {
        success: true,
        text: optimized,
        totalPages: 1,
        extractedPages: 1,
      };
    } catch (err: any) {
      return {
        success: false,
        message: `Falha ao ler o arquivo de texto: ${err.message || 'Erro desconhecido'}`,
      };
    }
  }

  // Arquivos PDF
  if (fileName.endsWith('.pdf') || file.type === 'application/pdf') {
    try {
      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
      const pdf = await loadingTask.promise;
      const totalPages = pdf.numPages;

      let fullExtractedText = '';
      let pagesWithText = 0;

      for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
        const page = await pdf.getPage(pageNum);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str || '')
          .join(' ')
          .trim();

        if (pageText.length > 5) {
          pagesWithText++;
          fullExtractedText += `\n--- PÁGINA ${pageNum} ---\n` + pageText;
        }
      }

      if (!fullExtractedText || fullExtractedText.trim().length < 20) {
        return {
          success: false,
          isScanned: true,
          totalPages,
          extractedPages: 0,
          message:
            'Este PDF é composto por imagens escaneadas sem camada de texto pesquisável. Para cadastrar, copie e cole o resumo ou utilize a narração por voz da IA.',
        };
      }

      const optimized = optimizeTextForTokenBudget(fullExtractedText);

      return {
        success: true,
        text: optimized,
        totalPages,
        extractedPages: pagesWithText,
      };
    } catch (err: any) {
      console.error('Erro na extração de texto do PDF:', err);
      return {
        success: false,
        message: `Falha ao processar o arquivo PDF: ${err.message || 'Formato incompatível ou corrompido'}.`,
      };
    }
  }

  return {
    success: false,
    message: 'Formato não suportado. Por favor, envie um arquivo PDF, TXT ou MD.',
  };
};
