import { useState, type FC, type FormEvent } from 'react';
import type { AdDraft, AdCandidate, AdType, AdStatus, Language, Tone } from '../../../types/ads';
import { CharCount } from './CharCount';

interface AdDraftFormProps {
  initialDraft?: Partial<AdDraft>;
  draftId?: number;
  onSaved?: (draft: AdDraft) => void;
}

export const AdDraftForm: FC<AdDraftFormProps> = ({
  initialDraft,
  draftId,
  onSaved,
}) => {
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
    const newHeadlines = [...headlines];
    newHeadlines[index] = value;
    setHeadlines(newHeadlines);
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
    const newDescriptions = [...descriptions];
    newDescriptions[index] = value;
    setDescriptions(newDescriptions);
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
      // Filter out empty headlines/descriptions
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

      // Redirect after short delay if creating new
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Error/Success Messages */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          {success}
        </div>
      )}

      {/* Campaign Settings */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-[#1d1d1f] mb-4">Campaign Settings</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="campaign_name" className="block text-sm font-medium text-[#1d1d1f] mb-2">
              Campaign Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="campaign_name"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              required
              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 focus:border-[#0071e3]"
            />
          </div>

          <div>
            <label htmlFor="final_url" className="block text-sm font-medium text-[#1d1d1f] mb-2">
              Landing Page URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              id="final_url"
              value={finalUrl}
              onChange={(e) => setFinalUrl(e.target.value)}
              required
              placeholder="https://example.com/product"
              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 focus:border-[#0071e3]"
            />
          </div>

          <div>
            <label htmlFor="ad_type" className="block text-sm font-medium text-[#1d1d1f] mb-2">
              Ad Type
            </label>
            <select
              id="ad_type"
              value={adType}
              onChange={(e) => setAdType(e.target.value as AdType)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 focus:border-[#0071e3]"
            >
              <option value="search">Search</option>
              <option value="display">Display</option>
              <option value="performance_max">Performance Max</option>
            </select>
          </div>

          <div>
            <label htmlFor="status" className="block text-sm font-medium text-[#1d1d1f] mb-2">
              Status
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as AdStatus)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 focus:border-[#0071e3]"
            >
              <option value="draft">Draft</option>
              <option value="ready">Ready</option>
            </select>
          </div>

          <div>
            <label htmlFor="language" className="block text-sm font-medium text-[#1d1d1f] mb-2">
              Language
            </label>
            <select
              id="language"
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 focus:border-[#0071e3]"
            >
              <option value="ja">Japanese</option>
              <option value="en">English</option>
            </select>
          </div>

          <div>
            <label htmlFor="tone" className="block text-sm font-medium text-[#1d1d1f] mb-2">
              Tone
            </label>
            <select
              id="tone"
              value={tone}
              onChange={(e) => setTone(e.target.value as Tone)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 focus:border-[#0071e3]"
            >
              <option value="professional">Professional</option>
              <option value="casual">Casual</option>
              <option value="urgent">Urgent</option>
              <option value="informative">Informative</option>
            </select>
          </div>

          <div>
            <label htmlFor="daily_budget" className="block text-sm font-medium text-[#1d1d1f] mb-2">
              Daily Budget (¥)
            </label>
            <input
              type="number"
              id="daily_budget"
              value={dailyBudget}
              onChange={(e) => setDailyBudget(e.target.value)}
              min="0"
              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 focus:border-[#0071e3]"
            />
          </div>
        </div>
      </div>

      {/* Product Context (Optional) */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-[#1d1d1f] mb-4">Product Context (Optional)</h3>

        <div className="space-y-4">
          <div>
            <label htmlFor="product_name" className="block text-sm font-medium text-[#1d1d1f] mb-2">
              Product Name
            </label>
            <input
              type="text"
              id="product_name"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 focus:border-[#0071e3]"
            />
          </div>

          <div>
            <label htmlFor="product_description" className="block text-sm font-medium text-[#1d1d1f] mb-2">
              Product Description
            </label>
            <textarea
              id="product_description"
              value={productDescription}
              onChange={(e) => setProductDescription(e.target.value)}
              rows={3}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 focus:border-[#0071e3]"
            />
          </div>

          <div>
            <label htmlFor="target_audience" className="block text-sm font-medium text-[#1d1d1f] mb-2">
              Target Audience
            </label>
            <input
              type="text"
              id="target_audience"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="e.g., Small business owners aged 25-45"
              className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 focus:border-[#0071e3]"
            />
          </div>
        </div>
      </div>

      {/* Headlines */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[#1d1d1f]">
            Headlines <span className="text-red-500">*</span>
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({headlines.filter((h) => h.trim()).length}/15)
            </span>
          </h3>
          {headlines.length < 15 && (
            <button
              type="button"
              onClick={handleAddHeadline}
              className="px-3 py-1 text-sm bg-gray-100 text-[#1d1d1f] rounded-lg hover:bg-gray-200 transition-colors"
            >
              + Add Headline
            </button>
          )}
        </div>

        <div className="space-y-3">
          {headlines.map((headline, index) => (
            <div key={index} className="flex items-start gap-2">
              <div className="flex-1">
                <input
                  type="text"
                  value={headline}
                  onChange={(e) => handleHeadlineChange(index, e.target.value)}
                  placeholder={`Headline ${index + 1}`}
                  maxLength={limits.headline * 2}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 focus:border-[#0071e3]"
                />
              </div>
              <div className="flex items-center gap-2">
                <CharCount text={headline} limit={limits.headline} />
                {headlines.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveHeadline(index)}
                    className="px-2 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Remove headline"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Descriptions */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-[#1d1d1f]">
            Descriptions <span className="text-red-500">*</span>
            <span className="ml-2 text-sm font-normal text-gray-500">
              ({descriptions.filter((d) => d.trim()).length}/4)
            </span>
          </h3>
          {descriptions.length < 4 && (
            <button
              type="button"
              onClick={handleAddDescription}
              className="px-3 py-1 text-sm bg-gray-100 text-[#1d1d1f] rounded-lg hover:bg-gray-200 transition-colors"
            >
              + Add Description
            </button>
          )}
        </div>

        <div className="space-y-3">
          {descriptions.map((description, index) => (
            <div key={index} className="flex items-start gap-2">
              <div className="flex-1">
                <textarea
                  value={description}
                  onChange={(e) => handleDescriptionChange(index, e.target.value)}
                  placeholder={`Description ${index + 1}`}
                  rows={2}
                  maxLength={limits.description * 2}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 focus:border-[#0071e3]"
                />
              </div>
              <div className="flex items-center gap-2">
                <CharCount text={description} limit={limits.description} />
                {descriptions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveDescription(index)}
                    className="px-2 py-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title="Remove description"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Keywords */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-[#1d1d1f] mb-4">Keywords (Optional)</h3>
        <input
          type="text"
          value={keywords.join(', ')}
          onChange={(e) => handleKeywordsChange(e.target.value)}
          placeholder="Enter keywords separated by commas"
          className="w-full px-4 py-2 border border-gray-200 rounded-lg text-sm text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 focus:border-[#0071e3]"
        />
        <p className="mt-2 text-xs text-gray-500">
          Separate multiple keywords with commas (e.g., "product, feature, benefit")
        </p>
      </div>

      {/* Submit Button */}
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isSubmitting}
          className="px-6 py-3 bg-[#0071e3] text-white rounded-lg font-medium hover:bg-[#0077ed] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting ? 'Saving...' : draftId ? 'Update Draft' : 'Create Draft'}
        </button>
        <a
          href="/admin/ads"
          className="px-6 py-3 bg-white text-[#1d1d1f] border border-gray-200 rounded-lg font-medium hover:bg-gray-50 transition-colors"
        >
          Cancel
        </a>
      </div>
    </form>
  );
};

// Export populateFromCandidate as a helper for external use
export const populateFormFromCandidate = (candidate: AdCandidate) => {
  return {
    headlines: candidate.headlines,
    descriptions: candidate.descriptions,
    keywords: candidate.suggestedKeywords,
  };
};
