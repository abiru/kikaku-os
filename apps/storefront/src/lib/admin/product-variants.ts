/**
 * Product variant CRUD handlers
 */

type VariantData = {
  id?: string;
  title?: string;
  sku?: string;
  prices?: Array<{ amount?: number; provider_price_id?: string }>;
};

export function initVariantHandlers(productId: string) {
  const modal = document.getElementById('variant-modal');
  const modalTitle = document.getElementById('modal-title');
  const variantForm = document.getElementById('variant-form') as HTMLFormElement | null;
  const variantIdInput = document.getElementById('variant-id') as HTMLInputElement | null;
  const variantTitleInput = document.getElementById('variant-title') as HTMLInputElement | null;
  const variantSkuInput = document.getElementById('variant-sku') as HTMLInputElement | null;
  const priceAmountInput = document.getElementById('price-amount') as HTMLInputElement | null;
  const stripePriceIdInput = document.getElementById('stripe-price-id') as HTMLInputElement | null;
  const modalError = document.getElementById('modal-error');
  const addVariantBtn = document.getElementById('add-variant-btn');
  const cancelModalBtn = document.getElementById('cancel-modal-btn');

  function showModal(isEdit = false, variant: VariantData | null = null) {
    if (!modal || !modalTitle || !variantIdInput || !variantTitleInput || !variantSkuInput || !priceAmountInput || !stripePriceIdInput || !modalError) return;
    modalTitle.textContent = isEdit ? 'Edit Variant' : 'Add Variant';
    variantIdInput.value = variant?.id || '';
    variantTitleInput.value = variant?.title || '';
    variantSkuInput.value = variant?.sku || '';
    const price = variant?.prices?.[0];
    priceAmountInput.value = price?.amount?.toString() || '';
    stripePriceIdInput.value = price?.provider_price_id || '';
    modalError.classList.add('hidden');
    modal.classList.remove('hidden');
  }

  function hideModal() {
    if (!modal || !variantForm) return;
    modal.classList.add('hidden');
    variantForm.reset();
  }

  function showError(message: string) {
    if (!modalError) return;
    const errorDiv = modalError.querySelector('div');
    if (errorDiv) {
      errorDiv.textContent = message;
      modalError.classList.remove('hidden');
    }
  }

  addVariantBtn?.addEventListener('click', () => showModal(false));
  cancelModalBtn?.addEventListener('click', hideModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) hideModal();
  });

  // Use event delegation for edit/delete variant buttons
  document.addEventListener('click', async (e) => {
    const editBtn = (e.target as HTMLElement).closest('.edit-variant-btn') as HTMLElement | null;
    if (editBtn) {
      const variant = JSON.parse(editBtn.dataset.variant || '{}');
      showModal(true, variant);
      return;
    }

    const deleteBtn = (e.target as HTMLElement).closest('.delete-variant-btn') as HTMLElement | null;
    if (deleteBtn) {
      const variantId = deleteBtn.dataset.variantId;
      const variantTitle = deleteBtn.dataset.variantTitle;
      if (!confirm(`Delete variant "${variantTitle}"? This will also delete its prices.`)) return;

      try {
        const res = await fetch(`/api/admin/products/${productId}/variants/${variantId}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          location.reload();
        } else {
          const data = await res.json();
          alert(data.message || 'Failed to delete variant');
        }
      } catch {
        alert('Failed to delete variant. Please try again.');
      }
    }
  });

  variantForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!variantIdInput || !variantTitleInput || !variantSkuInput || !priceAmountInput || !stripePriceIdInput) return;

    const variantId = variantIdInput.value;
    const isEdit = !!variantId;

    const title = variantTitleInput.value.trim();
    const sku = variantSkuInput.value.trim() || null;
    const amount = parseInt(priceAmountInput.value, 10);
    const provider_price_id = stripePriceIdInput.value.trim() || null;

    if (!title) {
      showError('Title is required');
      return;
    }
    if (isNaN(amount) || amount < 0) {
      showError('Price must be a valid positive number');
      return;
    }

    try {
      const variantUrl = isEdit
        ? `/api/admin/products/${productId}/variants/${variantId}`
        : `/api/admin/products/${productId}/variants`;

      const variantRes = await fetch(variantUrl, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, sku }),
      });

      if (!variantRes.ok) {
        const data = await variantRes.json();
        showError(data.message || 'Failed to save variant');
        return;
      }

      const variantData = await variantRes.json();
      const savedVariantId = variantData.variant?.id || variantId;

      const priceRes = await fetch(`/api/admin/variants/${savedVariantId}/prices`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prices: [{ currency: 'JPY', amount, provider_price_id }],
        }),
      });

      if (!priceRes.ok) {
        const data = await priceRes.json();
        showError(data.message || 'Failed to save price');
        return;
      }

      location.reload();
    } catch {
      showError('An error occurred. Please try again.');
    }
  });
}
