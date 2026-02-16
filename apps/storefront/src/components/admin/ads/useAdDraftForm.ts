import { useState, type FormEvent } from 'react';
import type { AdDraft, AdType, AdStatus, Language, Tone } from '../../../types/ads';

interface UseAdDraftFormOptions {
  initialDraft?: Partial<AdDraft>;
  draftId?: number;
  onSaved?: (draft: AdDraft) => void;
}

export function useAdDraftForm({ initialDraft, draftId, onSaved }: UseAdDraftFormOptions) {
  const [campaignName, setCampaignName] = useState(initialDraft?.campaign_name || '');
  const [adType, setAdType] = useState<AdType>(initialDraft?.ad_type || 'search');
  const [status, setStatus] = useState<AdStatus>(initialDraft?.status || 'draft');
  const [language, setLanguage] = useState<Language>(initialDraft?.language || 'ja');
  const [tone, setTone] = useState<Tone | ''>(initialDraft?.tone || 'professional');

  const [productName, setProductName] = useState(initialDraft?.product_name || '');
  const [productDescription, setProductDescription] = useState(initialDraft?.product_description || '');
  const [targetAudience, setTargetAudience] = useState(initialDraft?.target_audience || '');

  const [headlines, setHeadlines] = useState<string[]>(initialDraft?.headlines || ['']);
  const [descriptions, setDescriptions] = useState<string[]>(initialDraft?.descriptions || ['']);
  const [keywords, setKeywords] = useState<string[]>(initialDraft?.keywords || []);

  const [finalUrl, setFinalUrl] = useState(initialDraft?.final_url || '');
  const [dailyBudget, setDailyBudget] = useState<string>(initialDraft?.daily_budget?.toString() || '');

  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const limits = language === 'ja'
    ? { headline: 15, description: 45 }
    : { headline: 30, description: 90 };

  const handleFieldChange = (items: string[], index: number, value: string): string[] => {
    return items.map((item, i) => (i === index ? value : item));
  };

  const handleAddHeadline = () => {
    if (headlines.length < 15) {
      setHeadlines([...headlines, '']);
    }
  };

  const handleRemoveHeadline = (index: number) => {
    if (headlines.length > 1) {
      setHeadlines(headlines.filter((_, i) => i !== index));
    }
  };

  const handleHeadlineChange = (index: number, value: string) => {
    setHeadlines(handleFieldChange(headlines, index, value));
  };

  const handleAddDescription = () => {
    if (descriptions.length < 4) {
      setDescriptions([...descriptions, '']);
    }
  };

  const handleRemoveDescription = (index: number) => {
    if (descriptions.length > 1) {
      setDescriptions(descriptions.filter((_, i) => i !== index));
    }
  };

  const handleDescriptionChange = (index: number, value: string) => {
    setDescriptions(handleFieldChange(descriptions, index, value));
  };

  const handleKeywordsChange = (value: string) => {
    setKeywords(value.split(',').map((k) => k.trim()).filter((k) => k));
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    try {
      const filteredHeadlines = headlines.filter((h) => h.trim());
      const filteredDescriptions = descriptions.filter((d) => d.trim());

      if (filteredHeadlines.length === 0) {
        throw new Error('At least one headline is required');
      }
      if (filteredDescriptions.length === 0) {
        throw new Error('At least one description is required');
      }

      const payload = {
        campaign_name: campaignName,
        ad_type: adType,
        status,
        language,
        product_name: productName || null,
        product_description: productDescription || null,
        target_audience: targetAudience || null,
        headlines: filteredHeadlines,
        descriptions: filteredDescriptions,
        keywords: keywords.length > 0 ? keywords : null,
        final_url: finalUrl,
        daily_budget: dailyBudget ? parseInt(dailyBudget, 10) : null,
        tone: tone || null,
      };

      const method = draftId ? 'PUT' : 'POST';
      const url = draftId
        ? `/api/admin/ads/drafts/${draftId}`
        : `/api/admin/ads/drafts`;

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to save draft');
      }

      setSuccess(draftId ? 'Draft updated successfully!' : 'Draft created successfully!');

      if (onSaved && (data.draft || data)) {
        onSaved(data.draft || data);
      }

      if (!draftId && data.id) {
        setTimeout(() => {
          window.location.href = `/admin/ads/${data.id}`;
        }, 1000);
      }

    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    state: {
      campaignName,
      adType,
      status,
      language,
      tone,
      productName,
      productDescription,
      targetAudience,
      headlines,
      descriptions,
      keywords,
      finalUrl,
      dailyBudget,
      error,
      success,
      isSubmitting,
      limits,
    },
    handlers: {
      setCampaignName,
      setAdType,
      setStatus,
      setLanguage,
      setTone,
      setProductName,
      setProductDescription,
      setTargetAudience,
      setFinalUrl,
      setDailyBudget,
      handleAddHeadline,
      handleRemoveHeadline,
      handleHeadlineChange,
      handleAddDescription,
      handleRemoveDescription,
      handleDescriptionChange,
      handleKeywordsChange,
    },
    submit: handleSubmit,
  };
}
