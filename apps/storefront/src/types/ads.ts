// Google Ads Types for Storefront

export type AdType = 'search' | 'display' | 'performance_max';
export type AdStatus = 'draft' | 'ready';
export type Language = 'ja' | 'en';
export type Tone = 'professional' | 'casual' | 'urgent' | 'informative';

// Ad Draft
export interface AdDraft {
  id: number;
  campaign_name: string;
  ad_type: AdType;
  status: AdStatus;
  language: Language;

  product_id?: number | null;
  product_name?: string | null;
  product_description?: string | null;
  target_audience?: string | null;

  headlines: string[];
  descriptions: string[];
  keywords?: string[] | null;

  final_url: string;
  daily_budget?: number | null;
  tone?: Tone | null;

  last_prompt?: string | null;
  metadata?: Record<string, unknown> | null;

  created_at: string;
  updated_at: string;
}

// Ad Candidate (single variation from AI)
export interface AdCandidate {
  headlines: string[];
  descriptions: string[];
  suggestedKeywords: string[];
}
