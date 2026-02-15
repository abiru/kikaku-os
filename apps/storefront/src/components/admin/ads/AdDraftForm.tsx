import { useState, type FC, type FormEvent } from 'react';
import { Input } from '../../catalyst/input';
import { Select } from '../../catalyst/select';
import { Textarea } from '../../catalyst/textarea';
import { Button } from '../../catalyst/button';
import { Field, Label, Description } from '../../catalyst/fieldset';
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

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
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
        <h3 className="text-lg font-semibold text-zinc-950 mb-4">Campaign Settings</h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field>
            <Label>Campaign Name <span className="text-red-500">*</span></Label>
            <Input
              type="text"
              value={campaignName}
              onChange={(e) => setCampaignName(e.target.value)}
              required
            />
          </Field>

          <Field>
            <Label>Landing Page URL <span className="text-red-500">*</span></Label>
            <Input
              type="url"
              value={finalUrl}
              onChange={(e) => setFinalUrl(e.target.value)}
              required
              placeholder="https://example.com/product"
            />
          </Field>

          <Field>
            <Label>Ad Type</Label>
            <Select
              value={adType}
              onChange={(e) => setAdType(e.target.value as AdType)}
            >
              <option value="search">Search</option>
              <option value="display">Display</option>
              <option value="performance_max">Performance Max</option>
            </Select>
          </Field>

          <Field>
            <Label>Status</Label>
            <Select
              value={status}
              onChange={(e) => setStatus(e.target.value as AdStatus)}
            >
              <option value="draft">Draft</option>
              <option value="ready">Ready</option>
            </Select>
          </Field>

          <Field>
            <Label>Language</Label>
            <Select
              value={language}
              onChange={(e) => setLanguage(e.target.value as Language)}
            >
              <option value="ja">Japanese</option>
              <option value="en">English</option>
            </Select>
          </Field>

          <Field>
            <Label>Tone</Label>
            <Select
              value={tone}
              onChange={(e) => setTone(e.target.value as Tone)}
            >
              <option value="professional">Professional</option>
              <option value="casual">Casual</option>
              <option value="urgent">Urgent</option>
              <option value="informative">Informative</option>
            </Select>
          </Field>

          <Field>
            <Label>Daily Budget (¥)</Label>
            <Input
              type="number"
              value={dailyBudget}
              onChange={(e) => setDailyBudget(e.target.value)}
              min={0}
            />
          </Field>
        </div>
      </div>

      {/* Product Context (Optional) */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <h3 className="text-lg font-semibold text-zinc-950 mb-4">Product Context (Optional)</h3>

        <div className="space-y-4">
          <Field>
            <Label>Product Name</Label>
            <Input
              type="text"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
            />
          </Field>

          <Field>
            <Label>Product Description</Label>
            <Textarea
              value={productDescription}
              onChange={(e) => setProductDescription(e.target.value)}
              rows={3}
            />
          </Field>

          <Field>
            <Label>Target Audience</Label>
            <Input
              type="text"
              value={targetAudience}
              onChange={(e) => setTargetAudience(e.target.value)}
              placeholder="e.g., Small business owners aged 25-45"
            />
          </Field>
        </div>
      </div>

      {/* Headlines */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-zinc-950">
            Headlines <span className="text-red-500">*</span>
            <span className="ml-2 text-sm font-normal text-zinc-500">
              ({headlines.filter((h) => h.trim()).length}/15)
            </span>
          </h3>
          {headlines.length < 15 && (
            <Button
              type="button"
              outline
              onClick={handleAddHeadline}
            >
              + Add Headline
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {headlines.map((headline, index) => (
            <div key={index} className="flex items-start gap-2">
              <div className="flex-1">
                <Input
                  type="text"
                  value={headline}
                  onChange={(e) => handleHeadlineChange(index, e.target.value)}
                  placeholder={`Headline ${index + 1}`}
                  maxLength={limits.headline * 2}
                />
              </div>
              <div className="flex items-center gap-2">
                <CharCount text={headline} limit={limits.headline} />
                {headlines.length > 1 && (
                  <Button
                    type="button"
                    plain
                    onClick={() => handleRemoveHeadline(index)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Descriptions */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-zinc-950">
            Descriptions <span className="text-red-500">*</span>
            <span className="ml-2 text-sm font-normal text-zinc-500">
              ({descriptions.filter((d) => d.trim()).length}/4)
            </span>
          </h3>
          {descriptions.length < 4 && (
            <Button
              type="button"
              outline
              onClick={handleAddDescription}
            >
              + Add Description
            </Button>
          )}
        </div>

        <div className="space-y-3">
          {descriptions.map((description, index) => (
            <div key={index} className="flex items-start gap-2">
              <div className="flex-1">
                <Textarea
                  value={description}
                  onChange={(e) => handleDescriptionChange(index, e.target.value)}
                  placeholder={`Description ${index + 1}`}
                  rows={2}
                  maxLength={limits.description * 2}
                />
              </div>
              <div className="flex items-center gap-2">
                <CharCount text={description} limit={limits.description} />
                {descriptions.length > 1 && (
                  <Button
                    type="button"
                    plain
                    onClick={() => handleRemoveDescription(index)}
                    className="text-red-600 hover:text-red-800"
                  >
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                    </svg>
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Keywords */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <Field>
          <Label>Keywords (Optional)</Label>
          <Input
            type="text"
            value={keywords.join(', ')}
            onChange={(e) => handleKeywordsChange(e.target.value)}
            placeholder="Enter keywords separated by commas"
          />
          <Description>
            Separate multiple keywords with commas (e.g., "product, feature, benefit")
          </Description>
        </Field>
      </div>

      {/* Submit Button */}
      <div className="flex items-center gap-3">
        <Button
          type="submit"
          color="indigo"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Saving...' : draftId ? 'Update Draft' : 'Create Draft'}
        </Button>
        <Button
          outline
          href="/admin/ads"
        >
          Cancel
        </Button>
      </div>
    </form>
  );
};

export const populateFormFromCandidate = (candidate: AdCandidate) => {
  return {
    headlines: candidate.headlines,
    descriptions: candidate.descriptions,
    keywords: candidate.suggestedKeywords,
  };
};
