export type HeroDetail = {
	id: number;
	title: string;
	subtitle: string | null;
	cta_primary_text: string | null;
	cta_primary_url: string | null;
	cta_secondary_text: string | null;
	cta_secondary_url: string | null;
	position: number;
	status: string;
	image_r2_key: string | null;
	image_r2_key_small: string | null;
};

type HeroActionResult = {
	hero: HeroDetail | null;
	error: string | null;
	success: boolean;
	imageUploadSuccess: boolean;
	imageUploadError: string | null;
};

async function refreshHero(apiBase: string, apiKey: string, id: string): Promise<HeroDetail> {
	const res = await fetch(`${apiBase}/admin/home/heroes/${id}`, {
		headers: { 'x-admin-key': apiKey },
	});
	const data = await res.json();
	return data.hero;
}

export async function handleHeroPost(
	formData: FormData,
	hero: HeroDetail,
	apiBase: string,
	apiKey: string,
	id: string,
): Promise<HeroActionResult> {
	const imageFile = formData.get('image_upload');
	const imageType = formData.get('image_type');
	const deleteImageType = formData.get('delete_image_type');

	const isImageOperation = (imageFile instanceof File && imageFile.size > 0) || deleteImageType;

	// Hero data update
	if (!isImageOperation) {
		try {
			const title = formData.get('title') as string;
			const subtitle = formData.get('subtitle') as string;
			const ctaPrimaryText = formData.get('cta_primary_text') as string;
			const ctaPrimaryUrl = formData.get('cta_primary_url') as string;
			const ctaSecondaryText = formData.get('cta_secondary_text') as string;
			const ctaSecondaryUrl = formData.get('cta_secondary_url') as string;
			const position = Number(formData.get('position') || '0');
			const status = (formData.get('status') as string) || 'draft';

			const body: Record<string, string | number | null> = {};

			if (title !== hero.title) body.title = title;
			if (subtitle !== hero.subtitle) body.subtitle = subtitle || null;
			if (ctaPrimaryText !== hero.cta_primary_text) body.cta_primary_text = ctaPrimaryText || null;
			if (ctaPrimaryUrl !== hero.cta_primary_url) body.cta_primary_url = ctaPrimaryUrl || null;
			if (ctaSecondaryText !== hero.cta_secondary_text) body.cta_secondary_text = ctaSecondaryText || null;
			if (ctaSecondaryUrl !== hero.cta_secondary_url) body.cta_secondary_url = ctaSecondaryUrl || null;
			if (position !== hero.position) body.position = position;
			if (status !== hero.status) body.status = status;

			if (Object.keys(body).length > 0) {
				const res = await fetch(`${apiBase}/admin/home/heroes/${id}`, {
					method: 'PUT',
					headers: {
						'Content-Type': 'application/json',
						'x-admin-key': apiKey,
					},
					body: JSON.stringify(body),
				});

				if (!res.ok) {
					const data = await res.json();
					throw new Error(data.message || 'Failed to update hero section');
				}

				const refreshed = await refreshHero(apiBase, apiKey, id);
				return { hero: refreshed, error: null, success: true, imageUploadSuccess: false, imageUploadError: null };
			}

			return { hero, error: null, success: false, imageUploadSuccess: false, imageUploadError: null };
		} catch (e: unknown) {
			const msg = e instanceof Error ? e.message : 'Failed to update hero section';
			const error = msg.includes('Invalid input')
				? 'Validation error: Please check all required fields'
				: msg;
			return { hero, error, success: false, imageUploadSuccess: false, imageUploadError: null };
		}
	}

	// Image deletion
	if (deleteImageType) {
		try {
			const res = await fetch(`${apiBase}/admin/home/heroes/${id}/image/${deleteImageType}`, {
				method: 'DELETE',
				headers: { 'x-admin-key': apiKey },
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.message || 'Failed to delete image');
			}

			const refreshed = await refreshHero(apiBase, apiKey, id);
			return { hero: refreshed, error: null, success: false, imageUploadSuccess: true, imageUploadError: null };
		} catch (e: unknown) {
			const imageUploadError = e instanceof Error ? e.message : 'Failed to delete image';
			return { hero, error: null, success: false, imageUploadSuccess: false, imageUploadError };
		}
	}

	// Image upload
	if (imageFile && imageFile instanceof File && imageFile.size > 0) {
		try {
			const uploadFormData = new FormData();
			uploadFormData.append('image', imageFile);
			uploadFormData.append('imageType', imageType as string);

			const res = await fetch(`${apiBase}/admin/home/heroes/${id}/image`, {
				method: 'POST',
				headers: { 'x-admin-key': apiKey },
				body: uploadFormData,
			});

			if (!res.ok) {
				const data = await res.json();
				throw new Error(data.message || 'Failed to upload image');
			}

			const refreshed = await refreshHero(apiBase, apiKey, id);
			return { hero: refreshed, error: null, success: false, imageUploadSuccess: true, imageUploadError: null };
		} catch (e: unknown) {
			const imageUploadError = e instanceof Error ? e.message : 'Failed to upload image';
			return { hero, error: null, success: false, imageUploadSuccess: false, imageUploadError };
		}
	}

	return { hero, error: null, success: false, imageUploadSuccess: false, imageUploadError: null };
}
