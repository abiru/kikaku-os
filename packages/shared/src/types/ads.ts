// Google Ads Types

export type AdType = 'search' | 'display' | 'performance_max';
export type AdStatus = 'draft' | 'ready';
export type Language = 'ja' | 'en';
export type Tone = 'professional' | 'casual' | 'urgent' | 'informative';

// Ad Draft (database entity)
export interface AdDraft {
  id: number;
  campaign_name: string;
  ad_type: AdType;
  status: AdStatus;
  language: Language;

  // Product context
  product_id?: number | null;
  product_name?: string | null;
  product_description?: string | null;
  target_audience?: string | null;

  // Ad content (stored as JSON strings in DB, parsed as arrays)
  headlines: string[];
  descriptions: string[];
  keywords?: string[] | null;

  // Ad settings
  final_url: string;
  daily_budget?: number | null;
  tone?: Tone | null;

  // AI context
  last_prompt?: string | null;

  // Metadata
  metadata?: Record<string, unknown> | null;

  created_at: string;
  updated_at: string;
}

// Ad Draft Create Input
export interface AdDraftCreateInput {
  campaign_name: string;
  ad_type?: AdType;
  status?: AdStatus;
  language?: Language;

  product_id?: number;
  product_name?: string;
  product_description?: string;
  target_audience?: string;

  headlines: string[];
  descriptions: string[];
  keywords?: string[];

  final_url: string;
  daily_budget?: number;
  tone?: Tone;

  last_prompt?: string;
  metadata?: Record<string, unknown>;
}

// Ad Draft Update Input (all fields optional)
export interface AdDraftUpdateInput {
  campaign_name?: string;
  ad_type?: AdType;
  status?: AdStatus;
  language?: Language;

  product_id?: number;
  product_name?: string;
  product_description?: string;
  target_audience?: string;

  headlines?: string[];
  descriptions?: string[];
  keywords?: string[];

  final_url?: string;
  daily_budget?: number;
  tone?: Tone;

  last_prompt?: string;
  metadata?: Record<string, unknown>;
}

// AI Generation Request
export interface AdGenerateRequest {
  productName: string;
  productDescription: string;
  targetAudience: string;
  keywords: string[];
  tone: Tone;
  language: Language;
  adType: AdType;
  finalUrl: string;
  draftId?: number;  // Optional: link to existing draft
}

// Ad Candidate (single variation)
export interface AdCandidate {
  headlines: string[];
  descriptions: string[];
  suggestedKeywords: string[];
}

// AI Generation Response
export interface AdGenerateResponse {
  candidates: AdCandidate[];  // 3 variations
  promptUsed: string;
  historyId: number;  // Saved history record ID
}

// Ad Generation History (database entity)
export interface AdGenerationHistory {
  id: number;
  draft_id?: number | null;
  prompt: string;
  generated_content: string;  // JSON string of { candidates: AdCandidate[] }
  selected: number;  // 0 or 1
  created_at: string;
}

// Validation Result
export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings?: string[];
}

// Character Count Result
export interface CharCountResult {
  valid: boolean;
  length: number;
  limit: number;
  message?: string;
}
