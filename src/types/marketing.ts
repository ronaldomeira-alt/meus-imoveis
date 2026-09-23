import type { Property } from './property';

export type PostStatus =
  | 'draft'
  | 'approved'
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed';

export type PostType = 'image' | 'feed' | 'carousel' | 'reel';

export type RegenerationOption =
  | 'default'
  | 'shorter'
  | 'natural'
  | 'consultative'
  | 'objective'
  | 'investment'
  | 'family';

export interface MarketingEditorialSettings {
  id?: string;
  structural_skill: string;
  realtor_profile_skill: string;
  negative_rules_skill: string;
  created_at?: string;
  updated_at?: string;
}

export interface MarketingPost {
  id?: string;
  listing_id?: string;
  property_snapshot?: Partial<Property>;
  caption: string;
  media_urls?: string[];
  cover_url?: string | null;
  post_type: PostType;
  channel: 'instagram';
  status: PostStatus;
  scheduled_at?: string | null;
  published_at?: string | null;
  provider?: string;
  external_media_id?: string | null;
  last_error?: string | null;
  retry_count?: number;
  publishing_lock_until?: string | null;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type InstagramConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error'
  | 'expired';

export interface InstagramAccount {
  id?: string;
  instagram_user_id?: string;
  instagram_username?: string;
  instagram_name?: string;
  profile_picture_url?: string;
  access_token?: string;
  token_expires_at?: string;
  status: InstagramConnectionStatus;
  scopes?: string[];
  last_error?: string;
  connected_at?: string;
  updated_at?: string;
}

export const DEFAULT_STRUCTURAL_SKILL = `Técnicas de copywriting e narrativa aplicadas ao mercado imobiliário:
- Estruture a narrativa usando como base o método AIDA adaptativo (Atenção, Interesse, Desejo, Ação) para posts mais descritivos, ou ganchos diretos para posts mais curtos.
- GANCHO (Atenção): Comece destacando um fato concreto, localização estratégica ou benefício real da propriedade, nunca com saudações vazias ou perguntas óbvias.
- DESENVOLVIMENTO (Interesse & Desejo): Conecte as características técnicas da ficha (área, quartos, vagas) às vivências reais do dia a dia (vizinhança, proximidade da praia, comodidades ao redor citadas nas Observações).
- HIERARQUIA & RITMO: Parágrafos curtos, frases de leitura fluida, quebras de linha confortáveis para leitura no feed do Instagram.
- CTA (Chamada para Ação): Finalize sempre com uma ação clara e elegante (ex: "Envie um direct ou comente para receber a apresentação completa e agendar sua visita").
- HASHTAGS: Inclua no final 3 a 5 hashtags contextualizadas com a cidade e bairro do imóvel.`;

export const DEFAULT_REALTOR_PROFILE_SKILL = `Como o corretor se comunica:
- Tom de voz consultivo, humano, próximo e seguro, agindo como um especialista e parceiro do cliente, não um vendedor panfletário.
- Para imóveis residenciais/familiares: linguagem acolhedora, destacando bem-estar, iluminação, ventilação e a facilidade do bairro para a rotina da família.
- Para studios, flats e imóveis de praia/investimento: postura analítica e racional, destacando atratividade de locação, liquidez, proximidade de pontos turísticos e potencial de valorização.
- Vocabulário autêntico, limpo e profissional, sem afetação ou termos burocráticos desnecessários.`;

export const DEFAULT_NEGATIVE_RULES_SKILL = `O que NÃO fazer (Crivo de qualidade e anti-clichês):
- PROIBIDO usar clichês imobiliários batidos como: "onde o conforto encontra a qualidade de vida", "já pensou em morar aqui", "o imóvel dos seus sonhos", "não perca essa oportunidade única", "isso muda tudo".
- PROIBIDO usar falsa urgência apelativa ou chavões sensacionalistas.
- PROIBIDO inventar características, valores de condomínio, rentabilidades ou comodidades que não estejam explícitas na ficha técnica ou nas Observações.
- PROIBIDO excesso de adjetivos vazios (ex: "maravilhoso", "espetacular", "incrível", "sensacional"). Use substantivos e fatos concretos para demonstrar valor.
- Evite construções robóticas típicas de IA (ex: "Imagine um lugar...", "Seja bem-vindo ao seu novo lar").`;
