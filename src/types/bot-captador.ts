// ==============================================================================
// Tipos TypeScript Oficiais — Módulo Bot Captador (Meus Imóveis)
// ==============================================================================

export type BotHealthStatus = 'active' | 'paused' | 'attention' | 'error';
export type CampaignType = 'venda' | 'locacao';
export type TriggerType = 'SCHEDULED' | 'MANUAL' | 'SIMULATION';
export type RoundStatus = 'RUNNING' | 'COMPLETED' | 'FAILED' | 'INTERRUPTED';

export type CaptureStatus =
  | 'DISCOVERED'
  | 'QUEUED'
  | 'RESERVED'
  | 'CONTACTED'
  | 'WAITING_RESPONSE'
  | 'RESPONDED'
  | 'IMPORTED'
  | 'ARCHIVED'
  | 'EXPIRED'
  | 'FAILED'
  | 'POSSIBLE_DUPLICATE';

export interface BotSettings {
  account_id: string;
  is_active: boolean;
  health_status: BotHealthStatus;
  health_reason?: string | null;
  last_round_at?: string | null;
  next_round_at?: string | null;
  last_round_summary?: string | null;
  retention_days: number;
  olx_connected?: boolean;
  olx_username?: string | null;
  olx_last_checked_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface BotCampaign {
  id: string;
  account_id: string;
  type: CampaignType;
  is_active: boolean;
  neighborhoods: string[];
  min_price?: number | null;
  max_price?: number | null;
  min_bedrooms?: number | null;
  max_bedrooms?: number | null;
  min_area?: number | null;
  max_area?: number | null;
  only_private: boolean;
  rounds_per_day: 1 | 2;
  schedule_times: string[];
  max_contacts_per_round: number;
  created_at: string;
  updated_at: string;
}

export interface BotMessageTemplate {
  id: string;
  account_id: string;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
  // Métricas agregadas calculadas
  sent_count?: number;
  responses_count?: number;
  response_rate?: number;
  imported_count?: number;
  conversion_rate?: number;
}

export interface BotCapture {
  id: string;
  account_id: string;
  campaign_type: CampaignType;
  provider: string;
  external_id?: string | null;
  url: string;
  normalized_url: string;
  fingerprint: string;
  title: string;
  price?: number | null;
  neighborhood?: string | null;
  bedrooms?: number | null;
  area_m2?: number | null;
  owner_name?: string | null;
  owner_contact?: string | null;
  status: CaptureStatus;
  message_template_id?: string | null;
  message_sent_snapshot?: string | null;
  reserved_at?: string | null;
  contacted_at?: string | null;
  responded_at?: string | null;
  imported_property_id?: string | null;
  rejection_reason?: string | null;
  expires_at: string;
  created_at: string;
  updated_at: string;
}

export interface BotExecutionRound {
  id: string;
  account_id: string;
  campaign_type: CampaignType | 'both';
  trigger_type: TriggerType;
  status: RoundStatus;
  started_at: string;
  finished_at?: string | null;
  analyzed_count: number;
  new_count: number;
  eligible_count: number;
  contacted_count: number;
  duplicate_count: number;
  error_count: number;
  error_summary?: string | null;
  details?: Record<string, any>;
}

export interface BotDashboardMetrics {
  totalContacted: number;
  totalResponded: number;
  totalImported: number;
  responseRate: number;
  conversionRate: number;
  waitingCount: number;
  archivedCount: number;
  trendSeries: Array<{
    date: string;
    contacted: number;
    responded: number;
    imported: number;
  }>;
}

export interface DiscoveredAdCandidate {
  externalId: string;
  url: string;
  normalizedUrl: string;
  fingerprint: string;
  title: string;
  price?: number | null;
  neighborhood?: string | null;
  bedrooms?: number | null;
  areaM2?: number | null;
  ownerName?: string | null;
  ownerContact?: string | null;
  isPrivate: boolean;
  campaignType: CampaignType;
  provider: string;
  rawAttributes?: Record<string, any>;
}
