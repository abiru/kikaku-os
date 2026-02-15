/**
 * Product image upload and delete handlers
 */

export function initImageHandlers(productId: string) {
  const imageUpload = document.getElementById('image-upload') as HTMLInputElement | null;
  const uploadProgress = document.getElementById('upload-progress');
  const imageError = document.getElementById('image-error');

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
}
