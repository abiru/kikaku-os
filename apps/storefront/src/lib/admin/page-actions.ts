type Page = {
	id: number;
	slug: string;
	title: string;
	meta_title: string | null;
	meta_description: string | null;
	body: string;
	status: string;
	created_at: string;
	updated_at: string;
};

type PageUpdateResult = {
	page: Page | null;
	error: string | null;
	successMessage: string | null;
};

export async function handlePageUpdate(
	formData: FormData,
	apiBase: string,
	apiKey: string,
	id: string,
): Promise<PageUpdateResult> {
	const slug = formData.get('slug')?.toString().trim().toLowerCase() || '';
	const title = formData.get('title')?.toString().trim() || '';
	const meta_title = formData.get('meta_title')?.toString().trim() || '';
	const meta_description = formData.get('meta_description')?.toString().trim() || '';
	const body = formData.get('body')?.toString() || '';
	const status = formData.get('status')?.toString() || 'draft';

	if (!slug) {
		return { page: null, error: 'Slug is required', successMessage: null };
	}
	if (!/^[a-z0-9-]+$/.test(slug)) {
		return { page: null, error: 'Slug must contain only lowercase letters, numbers, and hyphens', successMessage: null };
	}
	if (!title) {
		return { page: null, error: 'Title is required', successMessage: null };
	}

	try {
		const res = await fetch(`${apiBase}/admin/pages/${id}`, {
			method: 'PUT',
			headers: {
				'Content-Type': 'application/json',
				'x-admin-key': apiKey,
			},
			body: JSON.stringify({
				slug,
				title,
				meta_title: meta_title || null,
				meta_description: meta_description || null,
				body,
				status,
			}),
		});

		const data = await res.json();

		if (!res.ok) {
			return { page: null, error: data.message || 'Failed to update page', successMessage: null };
		}

		return { page: data.page, error: null, successMessage: 'Page updated successfully' };
	} catch (e) {
		console.error(e);
		return { page: null, error: 'Failed to update page. Please check your connection.', successMessage: null };
	}
}
