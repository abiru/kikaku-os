/**
 * Product web fetch preview handlers
 */

type FetchedData = {
  image_url?: string;
  original_title?: string;
  specs?: Record<string, string>;
  source?: string;
  generated_title?: string;
  generated_description?: string;
};

export function initWebFetchHandlers(productId: string) {
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
