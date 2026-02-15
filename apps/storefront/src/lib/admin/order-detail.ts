const KNOWN_CARRIERS = ['ヤマト運輸', '佐川急便', '日本郵便'];

function getCarrierValue(selectEl: HTMLSelectElement, customEl: HTMLInputElement): string | null {
	if (selectEl.value === 'other') return customEl.value.trim() || null;
	return selectEl.value || null;
}

function showError(errorEl: HTMLElement, message: string) {
	errorEl.textContent = message;
	errorEl.classList.remove('hidden');
}

function initFulfillmentHandlers(orderId: string) {
	const createModal = document.getElementById('create-fulfillment-modal');
	const createForm = document.getElementById('create-fulfillment-form') as HTMLFormElement | null;
	const createStatus = document.getElementById('create-status') as HTMLSelectElement | null;
	const createTracking = document.getElementById('create-tracking') as HTMLInputElement | null;
	const createCarrier = document.getElementById('create-carrier') as HTMLSelectElement | null;
	const createCustomCarrier = document.getElementById('create-custom-carrier') as HTMLInputElement | null;
	const createCustomCarrierField = document.getElementById('create-custom-carrier-field');
	const createError = document.getElementById('create-error');
	const createBtn = document.getElementById('create-fulfillment-btn');
	const cancelCreateBtn = document.getElementById('cancel-create-btn');

	const editModal = document.getElementById('edit-fulfillment-modal');
	const editForm = document.getElementById('edit-fulfillment-form') as HTMLFormElement | null;
	const editFulfillmentId = document.getElementById('edit-fulfillment-id') as HTMLInputElement | null;
	const editSubtitle = document.getElementById('edit-subtitle');
	const editStatus = document.getElementById('edit-status') as HTMLSelectElement | null;
	const editTracking = document.getElementById('edit-tracking') as HTMLInputElement | null;
	const editCarrier = document.getElementById('edit-carrier') as HTMLSelectElement | null;
	const editCustomCarrier = document.getElementById('edit-custom-carrier') as HTMLInputElement | null;
	const editCustomCarrierField = document.getElementById('edit-custom-carrier-field');
	const editError = document.getElementById('edit-error');
	const cancelEditBtn = document.getElementById('cancel-edit-btn');

	createCarrier?.addEventListener('change', function() {
		if (createCarrier.value === 'other') {
			createCustomCarrierField?.classList.remove('hidden');
		} else {
			createCustomCarrierField?.classList.add('hidden');
			if (createCustomCarrier) createCustomCarrier.value = '';
		}
	});

	editCarrier?.addEventListener('change', function() {
		if (editCarrier.value === 'other') {
			editCustomCarrierField?.classList.remove('hidden');
		} else {
			editCustomCarrierField?.classList.add('hidden');
			if (editCustomCarrier) editCustomCarrier.value = '';
		}
	});

	function showCreateModal() {
		if (!createStatus || !createTracking || !createError || !createModal) return;
		createStatus.value = 'pending';
		createTracking.value = '';
		if (createCarrier) createCarrier.value = '';
		if (createCustomCarrier) createCustomCarrier.value = '';
		if (createCustomCarrierField) createCustomCarrierField.classList.add('hidden');
		createError.classList.add('hidden');
		createModal.classList.remove('hidden');
	}

	function hideCreateModal() {
		if (!createModal || !createForm) return;
		createModal.classList.add('hidden');
		createForm.reset();
		if (createCustomCarrierField) createCustomCarrierField.classList.add('hidden');
	}

	function showEditModal(fulfillment: { id: number; status: string; tracking_number: string | null; metadata?: string | Record<string, string> }) {
		if (!editFulfillmentId || !editSubtitle || !editStatus || !editTracking || !editError || !editModal || !editCarrier || !editCustomCarrier || !editCustomCarrierField) return;
		editFulfillmentId.value = String(fulfillment.id);
		editSubtitle.textContent = `Fulfillment #${fulfillment.id}`;
		editStatus.value = fulfillment.status;
		editTracking.value = fulfillment.tracking_number || '';

		var carrierValue = '';
		if (fulfillment.metadata) {
			try {
				var meta = typeof fulfillment.metadata === 'string' ? JSON.parse(fulfillment.metadata) : fulfillment.metadata;
				carrierValue = meta.carrier || '';
			} catch (_e) { /* ignore */ }
		}

		if (carrierValue && KNOWN_CARRIERS.indexOf(carrierValue) === -1) {
			editCarrier.value = 'other';
			editCustomCarrier.value = carrierValue;
			editCustomCarrierField.classList.remove('hidden');
		} else {
			editCarrier.value = carrierValue;
			editCustomCarrier.value = '';
			editCustomCarrierField.classList.add('hidden');
		}

		editError.classList.add('hidden');
		editModal.classList.remove('hidden');
	}

	function hideEditModal() {
		if (!editModal || !editForm) return;
		editModal.classList.add('hidden');
		editForm.reset();
		if (editCustomCarrierField) editCustomCarrierField.classList.add('hidden');
	}

	createBtn?.addEventListener('click', showCreateModal);
	cancelCreateBtn?.addEventListener('click', hideCreateModal);
	cancelEditBtn?.addEventListener('click', hideEditModal);

	createModal?.addEventListener('click', (e) => {
		if (e.target === createModal) hideCreateModal();
	});

	editModal?.addEventListener('click', (e) => {
		if (e.target === editModal) hideEditModal();
	});

	document.querySelectorAll('.edit-fulfillment-btn').forEach((btn) => {
		btn.addEventListener('click', () => {
			const fulfillment = JSON.parse((btn as HTMLElement).dataset.fulfillment || '{}');
			showEditModal(fulfillment);
		});
	});

	createForm?.addEventListener('submit', async (e) => {
		e.preventDefault();
		if (!createStatus || !createTracking || !createCarrier || !createCustomCarrier || !createError) return;

		const status = createStatus.value;
		const tracking_number = createTracking.value.trim() || null;
		const carrier = getCarrierValue(createCarrier, createCustomCarrier);

		try {
			const res = await fetch(`/api/admin/orders/${orderId}/fulfillments`, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ status, tracking_number, carrier })
			});

			if (!res.ok) {
				const data = await res.json();
				showError(createError, data.message || 'Failed to create fulfillment');
				return;
			}

			location.reload();
		} catch (_err) {
			showError(createError, 'An error occurred. Please try again.');
		}
	});

	editForm?.addEventListener('submit', async (e) => {
		e.preventDefault();
		if (!editFulfillmentId || !editStatus || !editTracking || !editCarrier || !editCustomCarrier || !editError) return;

		const fulfillmentId = editFulfillmentId.value;
		const status = editStatus.value;
		const tracking_number = editTracking.value.trim() || null;
		const carrier = getCarrierValue(editCarrier, editCustomCarrier);

		try {
			const res = await fetch(`/api/admin/fulfillments/${fulfillmentId}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({ status, tracking_number, carrier })
			});

			if (!res.ok) {
				const data = await res.json();
				showError(editError, data.message || 'Failed to update fulfillment');
				return;
			}

			location.reload();
		} catch (_err) {
			showError(editError, 'An error occurred. Please try again.');
		}
	});
}

function initRefundHandlers(orderId: string, payments: string, refundsData: string) {
	const refundModal = document.getElementById('create-refund-modal');
	const refundForm = document.getElementById('create-refund-form') as HTMLFormElement | null;
	const refundType = document.getElementById('refund-type') as HTMLSelectElement | null;
	const refundAmount = document.getElementById('refund-amount') as HTMLInputElement | null;
	const refundReason = document.getElementById('refund-reason') as HTMLInputElement | null;
	const refundError = document.getElementById('refund-error');
	const refundMaxInfo = document.getElementById('refund-max-info');
	const refundBtn = document.getElementById('create-refund-btn');
	const cancelRefundBtn = document.getElementById('cancel-refund-btn');
	const submitRefundBtn = document.getElementById('submit-refund-btn') as HTMLButtonElement | null;

	const confirmModal = document.getElementById('refund-confirm-modal');
	const confirmText = document.getElementById('refund-confirm-text');
	const confirmCancel = document.getElementById('refund-confirm-cancel');
	const confirmOk = document.getElementById('refund-confirm-ok');

	const parsedPayments = JSON.parse(payments);
	const parsedRefunds = JSON.parse(refundsData);
	const succeededPayment = parsedPayments.find(function(p: { status: string }) { return p.status === 'succeeded'; });
	const paymentAmount = succeededPayment ? succeededPayment.amount : 0;
	const refundedTotal = parsedRefunds
		.filter(function(r: { status: string }) { return r.status === 'succeeded' || r.status === 'pending'; })
		.reduce(function(sum: number, r: { amount: number }) { return sum + r.amount; }, 0);
	const maxRefundable = paymentAmount - refundedTotal;

	function showRefundModal() {
		if (!refundType || !refundAmount || !refundReason || !refundError || !refundMaxInfo || !refundModal) return;
		refundType.value = 'full';
		refundAmount.value = String(maxRefundable);
		refundAmount.disabled = true;
		refundAmount.max = String(maxRefundable);
		refundReason.value = '';
		refundError.classList.add('hidden');
		refundMaxInfo.textContent = 'Max refundable: ' + maxRefundable.toLocaleString() + ' JPY';
		refundModal.classList.remove('hidden');
	}

	function hideRefundModal() {
		if (!refundModal || !refundForm) return;
		refundModal.classList.add('hidden');
		refundForm.reset();
	}

	refundType?.addEventListener('change', function() {
		if (!refundAmount) return;
		if (refundType.value === 'full') {
			refundAmount.value = String(maxRefundable);
			refundAmount.disabled = true;
		} else {
			refundAmount.value = '';
			refundAmount.disabled = false;
			refundAmount.focus();
		}
	});

	refundBtn?.addEventListener('click', showRefundModal);
	cancelRefundBtn?.addEventListener('click', hideRefundModal);

	refundModal?.addEventListener('click', function(e) {
		if (e.target === refundModal) hideRefundModal();
	});

	let pendingRefundData: { amount: number | undefined; reason: string } | null = null;

	refundForm?.addEventListener('submit', function(e) {
		e.preventDefault();
		if (!refundType || !refundAmount || !refundReason || !refundError || !confirmText || !confirmModal) return;

		const amount = refundType.value === 'full' ? undefined : parseInt(refundAmount.value, 10);
		const reason = refundReason.value.trim();

		if (!reason) {
			showError(refundError, 'Please enter a reason for the refund.');
			return;
		}

		if (refundType.value === 'partial') {
			if (!amount || amount <= 0) {
				showError(refundError, 'Please enter a valid refund amount.');
				return;
			}
			if (amount > maxRefundable) {
				showError(refundError, 'Amount exceeds maximum refundable (' + maxRefundable.toLocaleString() + ' JPY).');
				return;
			}
		}

		const displayAmount = amount || maxRefundable;
		pendingRefundData = { amount: amount, reason: reason };
		confirmText.textContent = 'Are you sure you want to refund ' + displayAmount.toLocaleString() + ' JPY? This action cannot be undone.';
		confirmModal.classList.remove('hidden');
	});

	confirmCancel?.addEventListener('click', function() {
		if (!confirmModal) return;
		confirmModal.classList.add('hidden');
		pendingRefundData = null;
	});

	confirmModal?.addEventListener('click', function(e) {
		if (e.target === confirmModal) {
			confirmModal.classList.add('hidden');
			pendingRefundData = null;
		}
	});

	confirmOk?.addEventListener('click', async function() {
		if (!pendingRefundData || !submitRefundBtn || !refundError) return;

		confirmModal?.classList.add('hidden');
		submitRefundBtn.disabled = true;
		submitRefundBtn.textContent = 'Processing...';

		try {
			const body: { reason: string; amount?: number } = { reason: pendingRefundData.reason };
			if (pendingRefundData.amount) {
				body.amount = pendingRefundData.amount;
			}

			const res = await fetch('/api/admin/orders/' + orderId + '/refunds', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(body)
			});

			if (!res.ok) {
				const data = await res.json();
				showError(refundError, data.message || 'Failed to create refund');
				submitRefundBtn.disabled = false;
				submitRefundBtn.textContent = 'Create Refund';
				return;
			}

			location.reload();
		} catch (_err) {
			showError(refundError, 'An error occurred. Please try again.');
			submitRefundBtn.disabled = false;
			submitRefundBtn.textContent = 'Create Refund';
		}

		pendingRefundData = null;
	});
}

export function initOrderDetailPage(orderId: string, payments: string, refundsData: string) {
	initFulfillmentHandlers(orderId);
	initRefundHandlers(orderId, payments, refundsData);
}
