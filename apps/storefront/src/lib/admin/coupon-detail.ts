/**
 * Admin coupon detail page - client-side interactivity
 * Handles delete confirmation with ConfirmDialog
 */

export function initCouponDetailPage() {
	const deleteTrigger = document.getElementById('delete-trigger');
	const deleteForm = document.getElementById('delete-form') as HTMLFormElement | null;

	if (!deleteTrigger || !deleteForm) return;

	deleteTrigger.addEventListener('click', async () => {
		const confirmDialog = window.__confirmDialog;
		const confirmed = confirmDialog
			? await confirmDialog({
					title: 'Delete Coupon',
					message: 'Are you sure you want to delete this coupon? This action cannot be undone.',
					confirmLabel: 'Delete',
					danger: true,
				})
			: confirm('Are you sure you want to delete this coupon? This action cannot be undone.');
		if (confirmed) {
			deleteForm.submit();
		}
	});
}
