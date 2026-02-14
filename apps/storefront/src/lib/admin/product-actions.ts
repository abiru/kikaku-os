/**
 * Product archive and restore handlers
 */

export function initArchiveRestoreHandlers(productId: string) {
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
