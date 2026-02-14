/**
 * Admin product detail page - client-side interactivity
 * Handles image upload/delete, variant CRUD, web fetch preview, and archive/restore
 */

export function initProductPage(productId: string) {
  // Image handling
  const imageUpload = document.getElementById('image-upload') as HTMLInputElement | null;
  const uploadProgress = document.getElementById('upload-progress');
  const imageError = document.getElementById('image-error');

  // If elements don't exist yet (React still loading), retry
  if (!imageUpload && !document.getElementById('variant-modal')) {
    setTimeout(() => initProductPage(productId), 100);
    return;
  }

  function showImageError(message: string) {
    if (!imageError) return;
    const errorDiv = imageError.querySelector('div');
    if (errorDiv) {
      errorDiv.textContent = message;
      imageError.classList.remove('hidden');
      setTimeout(() => imageError.classList.add('hidden'), 5000);
    }
  }

  imageUpload?.addEventListener('change', async (e) => {
    const target = e.target as HTMLInputElement;
    const files = target.files;
    if (!files || files.length === 0) return;

    uploadProgress?.classList.remove('hidden');
    imageError?.classList.add('hidden');

    const formData = new FormData();
    for (const file of files) {
      formData.append('file', file);
    }

    try {
      const res = await fetch(`/api/admin/products/${productId}/images`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        showImageError(data.message || 'Failed to upload images');
      } else {
        location.reload();
      }
    } catch {
      showImageError('Failed to upload images. Please try again.');
    } finally {
      uploadProgress?.classList.add('hidden');
      if (imageUpload) imageUpload.value = '';
    }
  });

  // Use event delegation for delete image buttons
  document.addEventListener('click', async (e) => {
    const btn = (e.target as HTMLElement).closest('.delete-image-btn') as HTMLElement | null;
    if (!btn) return;

    const imageId = btn.dataset.imageId;
    const filename = btn.dataset.imageFilename;
    if (!confirm(`Delete image "${filename}"?`)) return;

    try {
      const res = await fetch(`/api/admin/products/${productId}/images/${imageId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        location.reload();
      } else {
        const data = await res.json();
        showImageError(data.message || 'Failed to delete image');
      }
    } catch {
      showImageError('Failed to delete image. Please try again.');
    }
  });

  initVariantHandlers(productId);
  initWebFetchHandlers(productId);
  initArchiveRestoreHandlers(productId);
}

function initVariantHandlers(productId: string) {
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

  type VariantData = {
    id?: string;
    title?: string;
    sku?: string;
    prices?: Array<{ amount?: number; provider_price_id?: string }>;
  };

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

type FetchedData = {
  image_url?: string;
  original_title?: string;
  specs?: Record<string, string>;
  source?: string;
  generated_title?: string;
  generated_description?: string;
};

function initWebFetchHandlers(productId: string) {
  const fetchUrlInput = document.getElementById('fetch-url') as HTMLInputElement | null;
  const fetchBtn = document.getElementById('fetch-btn') as HTMLButtonElement | null;
  const fetchSpinner = document.getElementById('fetch-spinner');
  const fetchLabel = document.getElementById('fetch-label');
  const fetchError = document.getElementById('fetch-error');
  const fetchPreview = document.getElementById('fetch-preview');
  const previewImage = document.getElementById('preview-image') as HTMLImageElement | null;
  const previewOriginalTitle = document.getElementById('preview-original-title');
  const previewSpecs = document.getElementById('preview-specs');
  const previewSource = document.getElementById('preview-source');
  const previewGeneratedTitle = document.getElementById('preview-generated-title');
  const previewGeneratedDescription = document.getElementById('preview-generated-description');
  const applyAllBtn = document.getElementById('apply-all-btn') as HTMLButtonElement | null;
  const applyTitleOnlyBtn = document.getElementById('apply-title-only-btn');
  const applyDescOnlyBtn = document.getElementById('apply-desc-only-btn');
  const sendInboxBtn = document.getElementById('send-inbox-btn') as HTMLButtonElement | null;
  const cancelPreviewBtn = document.getElementById('cancel-preview-btn');
  const applySuccess = document.getElementById('apply-success');
  const fetchWarning = document.getElementById('fetch-warning');

  let fetchedData: FetchedData | null = null;

  function showFetchError(message: string) {
    if (!fetchError) return;
    const errorDiv = fetchError.querySelector('div');
    if (errorDiv) {
      errorDiv.textContent = message;
      fetchError.classList.remove('hidden');
    }
  }

  function hideFetchError() {
    if (fetchError) fetchError.classList.add('hidden');
  }

  function hideFetchWarning() {
    if (fetchWarning) fetchWarning.classList.add('hidden');
  }

  function showPreview(data: FetchedData) {
    if (!fetchPreview) return;
    fetchedData = data;

    if (previewImage && data.image_url) {
      previewImage.src = data.image_url;
      previewImage.parentElement?.classList.remove('hidden');
    } else if (previewImage) {
      previewImage.parentElement?.classList.add('hidden');
    }

    if (previewOriginalTitle) {
      previewOriginalTitle.textContent = data.original_title || '-';
    }

    if (previewSpecs && data.specs) {
      const specsText = Object.entries(data.specs)
        .map(([key, value]) => `${key}: ${value}`)
        .join(' | ');
      previewSpecs.textContent = specsText || '-';
    } else if (previewSpecs) {
      previewSpecs.textContent = '-';
    }

    if (previewSource) {
      previewSource.textContent = data.source || '-';
    }

    if (previewGeneratedTitle) {
      previewGeneratedTitle.textContent = data.generated_title || '-';
    }

    // Show generated description (as text to prevent XSS from AI output)
    if (previewGeneratedDescription) {
      previewGeneratedDescription.textContent = data.generated_description || '-';
    }

    fetchPreview.classList.remove('hidden');
  }

  function hidePreview() {
    if (fetchPreview) fetchPreview.classList.add('hidden');
    fetchedData = null;
  }

  fetchBtn?.addEventListener('click', async () => {
    const url = fetchUrlInput?.value?.trim();
    if (!url) {
      showFetchError('URLを入力してください');
      return;
    }

    hideFetchError();
    hideFetchWarning();
    hidePreview();
    if (applySuccess) applySuccess.classList.add('hidden');

    if (fetchSpinner) fetchSpinner.classList.remove('hidden');
    if (fetchLabel) fetchLabel.textContent = '取得中...';
    if (fetchBtn) fetchBtn.disabled = true;

    try {
      const productName = (document.querySelector('input[name="title"]') as HTMLInputElement)?.value?.trim() || '';
      const res = await fetch('/api/admin/product-fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, productName }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        showFetchError(data.message || '取得に失敗しました');
      } else {
        showPreview(data);
      }
    } catch {
      showFetchError('通信エラーが発生しました');
    } finally {
      if (fetchSpinner) fetchSpinner.classList.add('hidden');
      if (fetchLabel) fetchLabel.textContent = '取得';
      if (fetchBtn) fetchBtn.disabled = false;
    }
  });

  cancelPreviewBtn?.addEventListener('click', hidePreview);

  async function sendToInbox(data: FetchedData) {
    const titleValue = (document.querySelector('input[name="title"]') as HTMLInputElement)?.value || 'Unknown';
    const res = await fetch('/api/inbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: `Product Update: ${titleValue}`,
        body: `Web取得による商品情報更新の提案\n\n画像: ${data.image_url || 'なし'}\n元タイトル: ${data.original_title || 'なし'}\n生成タイトル: ${data.generated_title || 'なし'}\n生成説明文: [HTML形式]\nソース: ${data.source || 'なし'}`,
        severity: 'info',
        kind: 'product_update',
        metadata: JSON.stringify({
          product_id: parseInt(productId),
          image_url: data.image_url,
          title: data.generated_title,
          description: data.generated_description,
          original_title: data.original_title,
          specs: data.specs,
          source: data.source,
        }),
      }),
    });
    return res;
  }

  applyAllBtn?.addEventListener('click', async () => {
    if (!fetchedData) return;

    if (!confirm('この情報をInboxに送信して承認待ちにしますか？')) return;

    if (sendInboxBtn) sendInboxBtn.disabled = true;
    if (applyAllBtn) {
      applyAllBtn.disabled = true;
      applyAllBtn.textContent = '送信中...';
    }

    try {
      const res = await sendToInbox(fetchedData);

      if (!res.ok) {
        const data = await res.json();
        showFetchError(data.message || 'Inbox送信に失敗しました');
      } else {
        hidePreview();
        if (applySuccess) applySuccess.classList.remove('hidden');
      }
    } catch {
      showFetchError('通信エラーが発生しました');
    } finally {
      if (sendInboxBtn) sendInboxBtn.disabled = false;
      if (applyAllBtn) {
        applyAllBtn.disabled = false;
        applyAllBtn.textContent = 'すべて適用';
      }
    }
  });

  applyTitleOnlyBtn?.addEventListener('click', () => {
    if (!fetchedData) return;
    const titleInput = document.querySelector('input[name="title"]') as HTMLInputElement | null;
    if (titleInput && fetchedData.generated_title) {
      titleInput.value = fetchedData.generated_title;
    }
    hidePreview();
    titleInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    titleInput?.focus();
  });

  applyDescOnlyBtn?.addEventListener('click', () => {
    if (!fetchedData) return;
    const descHidden = document.getElementById('description-hidden') as HTMLInputElement | null;
    if (descHidden && fetchedData.generated_description) {
      descHidden.value = fetchedData.generated_description;
    }
    hidePreview();
    descHidden?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  sendInboxBtn?.addEventListener('click', async () => {
    if (!fetchedData || !sendInboxBtn) return;

    sendInboxBtn.disabled = true;
    sendInboxBtn.textContent = '送信中...';

    try {
      const res = await sendToInbox(fetchedData);

      if (!res.ok) {
        const data = await res.json();
        showFetchError(data.message || 'Inbox送信に失敗しました');
      } else {
        hidePreview();
        if (applySuccess) applySuccess.classList.remove('hidden');
      }
    } catch {
      showFetchError('通信エラーが発生しました');
    } finally {
      sendInboxBtn.disabled = false;
      sendInboxBtn.textContent = 'Inboxに送信';
    }
  });
}

function initArchiveRestoreHandlers(productId: string) {
  const archiveBtn = document.getElementById('archive-product-btn');
  archiveBtn?.addEventListener('click', async () => {
    if (!confirm('Archive this product?')) return;

    try {
      const res = await fetch(`/api/admin/products/${productId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        window.location.href = '/admin/products?status=archived';
      } else {
        const data = await res.json();
        alert(data.message || 'Failed to archive');
      }
    } catch {
      alert('Failed to archive product');
    }
  });

  const restoreBtn = document.getElementById('restore-product-btn');
  restoreBtn?.addEventListener('click', async () => {
    if (!confirm('Restore this product?')) return;

    try {
      const res = await fetch(`/api/admin/products/${productId}/restore`, {
        method: 'POST',
      });

      if (res.ok) {
        location.reload();
      } else {
        const data = await res.json();
        alert(data.message || 'Failed to restore');
      }
    } catch {
      alert('Failed to restore product');
    }
  });
}
