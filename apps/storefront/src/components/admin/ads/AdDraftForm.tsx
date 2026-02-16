import type { FC } from 'react';
import { Input } from '../../catalyst/input';
import { Button } from '../../catalyst/button';
import { Field, Label, Description } from '../../catalyst/fieldset';
import type { AdDraft, AdCandidate } from '../../../types/ads';
import { useAdDraftForm } from './useAdDraftForm';
import { CampaignSettings } from './CampaignSettings';
import { ProductContext } from './ProductContext';
import { DynamicFieldList } from './DynamicFieldList';

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
  const { state, handlers, submit } = useAdDraftForm({ initialDraft, draftId, onSaved });

  return (
    <form onSubmit={submit} className="space-y-6">
      {state.error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
          {state.error}
        </div>
      )}
      {state.success && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg text-sm">
          {state.success}
        </div>
      )}

      <CampaignSettings
        campaignName={state.campaignName}
        finalUrl={state.finalUrl}
        adType={state.adType}
        status={state.status}
        language={state.language}
        tone={state.tone}
        dailyBudget={state.dailyBudget}
        onCampaignNameChange={handlers.setCampaignName}
        onFinalUrlChange={handlers.setFinalUrl}
        onAdTypeChange={handlers.setAdType}
        onStatusChange={handlers.setStatus}
        onLanguageChange={handlers.setLanguage}
        onToneChange={handlers.setTone}
        onDailyBudgetChange={handlers.setDailyBudget}
      />

      <ProductContext
        productName={state.productName}
        productDescription={state.productDescription}
        targetAudience={state.targetAudience}
        onProductNameChange={handlers.setProductName}
        onProductDescriptionChange={handlers.setProductDescription}
        onTargetAudienceChange={handlers.setTargetAudience}
      />

      <DynamicFieldList
        title="Headlines"
        items={state.headlines}
        maxItems={15}
        charLimit={state.limits.headline}
        addLabel="Add Headline"
        placeholderPrefix="Headline"
        onAdd={handlers.handleAddHeadline}
        onRemove={handlers.handleRemoveHeadline}
        onChange={handlers.handleHeadlineChange}
      />

      <DynamicFieldList
        title="Descriptions"
        items={state.descriptions}
        maxItems={4}
        charLimit={state.limits.description}
        addLabel="Add Description"
        placeholderPrefix="Description"
        multiline
        onAdd={handlers.handleAddDescription}
        onRemove={handlers.handleRemoveDescription}
        onChange={handlers.handleDescriptionChange}
      />

      {/* Keywords */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
        <Field>
          <Label>Keywords (Optional)</Label>
          <Input
            type="text"
            value={state.keywords.join(', ')}
            onChange={(e) => handlers.handleKeywordsChange(e.target.value)}
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
          disabled={state.isSubmitting}
        >
          {state.isSubmitting ? 'Saving...' : draftId ? 'Update Draft' : 'Create Draft'}
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
