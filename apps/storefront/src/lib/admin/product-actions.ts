/**
 * Product archive and restore handlers
 */

async function showConfirm(options: { title: string; message: string; confirmLabel?: string; danger?: boolean }): Promise<boolean> {
  const confirmDialog = (window as any).__confirmDialog;
  if (confirmDialog) {
    return confirmDialog(options);
  }
  return confirm(options.message);
}

export function initArchiveRestoreHandlers(productId: string) {
  const archiveBtn = document.getElementById('archive-product-btn');
  archiveBtn?.addEventListener('click', async () => {
    const confirmed = await showConfirm({
      title: 'Archive Product',
      message: 'Are you sure you want to archive this product? It will be hidden from the storefront.',
      confirmLabel: 'Archive',
      danger: true,
    });
    if (!confirmed) return;

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
    const confirmed = await showConfirm({
      title: 'Restore Product',
      message: 'Are you sure you want to restore this product? It will become visible on the storefront.',
      confirmLabel: 'Restore',
    });
    if (!confirmed) return;

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
