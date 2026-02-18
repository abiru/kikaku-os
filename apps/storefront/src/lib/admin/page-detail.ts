/**
 * Admin page detail - client-side interactivity
 * Handles markdown preview toggle, publish/unpublish, and delete actions
 */

import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';
import { logError } from '../logger';

type PageConfig = {
	pageId: string;
	canDelete: boolean;
	currentStatus: string;
	pageTitle: string;
	i18nPublish: string;
	i18nUnpublish: string;
	i18nPublished: string;
	i18nDraft: string;
};

const ALLOWED_TAGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'img', 'div', 'span'];
const ALLOWED_ATTR = ['href', 'target', 'rel', 'src', 'alt', 'title', 'class', 'id'];

function initPreviewToggle(bodyTextarea: HTMLTextAreaElement | null, previewContent: HTMLElement | null, editorContainer: HTMLElement | null, previewContainer: HTMLElement | null, previewToggle: HTMLElement | null) {
	let showPreview = false;

	previewToggle?.addEventListener('click', async () => {
		showPreview = !showPreview;

		if (showPreview) {
			editorContainer?.classList.add('hidden');
			previewContainer?.classList.remove('hidden');
			if (previewContent && bodyTextarea) {
				const markdown = bodyTextarea.value;
				if (!markdown || markdown.trim() === '') {
					previewContent.innerHTML = '<p class="text-secondary">No content to preview...</p>';
				} else {
					try {
						const html = await marked.parse(markdown);
						const sanitized = DOMPurify.sanitize(html, {
							ALLOWED_TAGS,
							ALLOWED_ATTR,
							ALLOW_DATA_ATTR: false,
						});
						previewContent.innerHTML = sanitized;
					} catch (error) {
						logError('Failed to parse markdown', error, { page: 'admin/pages/[id]', action: 'previewMarkdown' });
						previewContent.innerHTML = '<p class="text-red-500">Failed to parse markdown. Please check your syntax.</p>';
					}
				}
			}
			if (previewToggle) previewToggle.textContent = 'Edit';
		} else {
			editorContainer?.classList.remove('hidden');
			previewContainer?.classList.add('hidden');
			if (previewToggle) previewToggle.textContent = 'Toggle Preview';
		}
	});
}

function initDeleteHandler(config: PageConfig) {
	const deleteBtn = document.getElementById('delete-btn');
	if (!deleteBtn || !config.canDelete) return;

	deleteBtn.addEventListener('click', async () => {
		const confirmed = await (window as any).__confirmDialog({
			title: 'Delete Page',
			message: `Are you sure you want to delete "${config.pageTitle}"? This action cannot be undone.`,
			confirmLabel: 'Delete',
			danger: true,
		});
		if (!confirmed) return;

		try {
			const res = await fetch(`/api/admin/pages/${config.pageId}`, {
				method: 'DELETE',
			});

			if (res.ok) {
				window.location.href = '/admin/pages';
			} else {
				const data = await res.json();
				alert(data.message || 'Failed to delete page');
			}
		} catch (_e) {
			alert('Failed to delete page. Please try again.');
		}
	});
}

function initPublishHandler(config: PageConfig) {
	const publishBtn = document.getElementById('publish-btn');
	if (!publishBtn) return;

	publishBtn.addEventListener('click', async () => {
		const action = config.currentStatus === 'published' ? 'unpublish' : 'publish';

		try {
			const res = await fetch(`/api/admin/pages/${config.pageId}/${action}`, {
				method: 'POST',
			});

			if (res.ok) {
				const newStatus = action === 'publish' ? 'published' : 'draft';
				config.currentStatus = newStatus;

				publishBtn.textContent = newStatus === 'published' ? config.i18nUnpublish : config.i18nPublish;
				publishBtn.className = newStatus === 'published'
					? 'px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-yellow-100 text-yellow-700 hover:bg-yellow-200'
					: 'px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-green-100 text-green-700 hover:bg-green-200';

				const statusCard = publishBtn.closest('.bg-white');
				const badge = statusCard?.querySelector('[data-status-badge]');
				if (badge) {
					badge.textContent = newStatus === 'published' ? config.i18nPublished : config.i18nDraft;
					badge.className = 'inline-flex items-center gap-x-1.5 rounded-md px-1.5 py-0.5 text-sm/5 font-medium sm:text-xs/5 forced-colors:outline '
						+ (newStatus === 'published'
							? 'bg-blue-500/15 text-blue-700 group-data-hover:bg-blue-500/25'
							: 'bg-zinc-600/10 text-zinc-700 group-data-hover:bg-zinc-600/20');
				}

				const statusSelect = document.getElementById('status') as HTMLSelectElement | null;
				if (statusSelect) {
					statusSelect.value = newStatus;
				}
			} else {
				const data = await res.json();
				alert(data.message || `Failed to ${action} page`);
			}
		} catch (_e) {
			alert(`Failed to ${action} page. Please try again.`);
		}
	});
}

export function initPageDetailPage(config: PageConfig) {
	const previewToggle = document.getElementById('preview-toggle');
	const editorContainer = document.getElementById('editor-container');
	const previewContainer = document.getElementById('preview-container');
	const bodyTextarea = document.getElementById('body') as HTMLTextAreaElement | null;
	const previewContent = document.getElementById('preview-content');

	initPreviewToggle(bodyTextarea, previewContent, editorContainer, previewContainer, previewToggle);
	initDeleteHandler(config);
	initPublishHandler(config);
}
