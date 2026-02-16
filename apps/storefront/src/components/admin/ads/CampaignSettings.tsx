import type { FC } from 'react';
import { Input } from '../../catalyst/input';
import { Select } from '../../catalyst/select';
import { Field, Label } from '../../catalyst/fieldset';
import type { AdType, AdStatus, Language, Tone } from '../../../types/ads';

interface CampaignSettingsProps {
  campaignName: string;
  finalUrl: string;
  adType: AdType;
  status: AdStatus;
  language: Language;
  tone: Tone | '';
  dailyBudget: string;
  onCampaignNameChange: (value: string) => void;
  onFinalUrlChange: (value: string) => void;
  onAdTypeChange: (value: AdType) => void;
  onStatusChange: (value: AdStatus) => void;
  onLanguageChange: (value: Language) => void;
  onToneChange: (value: Tone | '') => void;
  onDailyBudgetChange: (value: string) => void;
}

export const CampaignSettings: FC<CampaignSettingsProps> = ({
  campaignName,
  finalUrl,
  adType,
  status,
  language,
  tone,
  dailyBudget,
  onCampaignNameChange,
  onFinalUrlChange,
  onAdTypeChange,
  onStatusChange,
  onLanguageChange,
  onToneChange,
  onDailyBudgetChange,
}) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
    <h3 className="text-lg font-semibold text-zinc-950 mb-4">Campaign Settings</h3>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <Field>
        <Label>Campaign Name <span className="text-red-500">*</span></Label>
        <Input
          type="text"
          value={campaignName}
          onChange={(e) => onCampaignNameChange(e.target.value)}
          required
        />
      </Field>

      <Field>
        <Label>Landing Page URL <span className="text-red-500">*</span></Label>
        <Input
          type="url"
          value={finalUrl}
          onChange={(e) => onFinalUrlChange(e.target.value)}
          required
          placeholder="https://example.com/product"
        />
      </Field>

      <Field>
        <Label>Ad Type</Label>
        <Select
          value={adType}
          onChange={(e) => onAdTypeChange(e.target.value as AdType)}
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
          onChange={(e) => onStatusChange(e.target.value as AdStatus)}
        >
          <option value="draft">Draft</option>
          <option value="ready">Ready</option>
        </Select>
      </Field>

      <Field>
        <Label>Language</Label>
        <Select
          value={language}
          onChange={(e) => onLanguageChange(e.target.value as Language)}
        >
          <option value="ja">Japanese</option>
          <option value="en">English</option>
        </Select>
      </Field>

      <Field>
        <Label>Tone</Label>
        <Select
          value={tone}
          onChange={(e) => onToneChange(e.target.value as Tone)}
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
          onChange={(e) => onDailyBudgetChange(e.target.value)}
          min={0}
        />
      </Field>
    </div>
  </div>
);
