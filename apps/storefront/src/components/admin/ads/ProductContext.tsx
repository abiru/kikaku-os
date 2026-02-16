import type { FC } from 'react';
import { Input } from '../../catalyst/input';
import { Textarea } from '../../catalyst/textarea';
import { Field, Label } from '../../catalyst/fieldset';

interface ProductContextProps {
  productName: string;
  productDescription: string;
  targetAudience: string;
  onProductNameChange: (value: string) => void;
  onProductDescriptionChange: (value: string) => void;
  onTargetAudienceChange: (value: string) => void;
}

export const ProductContext: FC<ProductContextProps> = ({
  productName,
  productDescription,
  targetAudience,
  onProductNameChange,
  onProductDescriptionChange,
  onTargetAudienceChange,
}) => (
  <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
    <h3 className="text-lg font-semibold text-zinc-950 mb-4">Product Context (Optional)</h3>

    <div className="space-y-4">
      <Field>
        <Label>Product Name</Label>
        <Input
          type="text"
          value={productName}
          onChange={(e) => onProductNameChange(e.target.value)}
        />
      </Field>

      <Field>
        <Label>Product Description</Label>
        <Textarea
          value={productDescription}
          onChange={(e) => onProductDescriptionChange(e.target.value)}
          rows={3}
        />
      </Field>

      <Field>
        <Label>Target Audience</Label>
        <Input
          type="text"
          value={targetAudience}
          onChange={(e) => onTargetAudienceChange(e.target.value)}
          placeholder="e.g., Small business owners aged 25-45"
        />
      </Field>
    </div>
  </div>
);
