/**
 * Image Zoom & Lightbox functionality for ProductImageGallery.
 *
 * Features:
 * - Hover lens zoom on desktop (background-position technique)
 * - Click to open fullscreen lightbox with <dialog>
 * - Keyboard navigation (Arrow keys, Escape, Enter/Space)
 * - Pinch-zoom support in lightbox via CSS touch-action
 * - Focus trap inside lightbox
 */

// ── Hover Zoom ──────────────────────────────────────────────

function initHoverZoom(): void {
	const container = document.getElementById('image-zoom-container');
	const mainImage = document.getElementById('main-image') as HTMLImageElement | null;
	const zoomOverlay = document.getElementById('zoom-overlay');

	if (!container || !mainImage || !zoomOverlay) return;

	const ZOOM_FACTOR = 2.5;

	const showZoom = (e: MouseEvent) => {
		const rect = container.getBoundingClientRect();
		const x = ((e.clientX - rect.left) / rect.width) * 100;
		const y = ((e.clientY - rect.top) / rect.height) * 100;

		zoomOverlay.style.backgroundImage = `url(${mainImage.src})`;
		zoomOverlay.style.backgroundSize = `${rect.width * ZOOM_FACTOR}px ${rect.height * ZOOM_FACTOR}px`;
		zoomOverlay.style.backgroundPosition = `${x}% ${y}%`;
		zoomOverlay.classList.remove('opacity-0', 'pointer-events-none');
		zoomOverlay.classList.add('opacity-100');
	};

	const hideZoom = () => {
		zoomOverlay.classList.add('opacity-0', 'pointer-events-none');
		zoomOverlay.classList.remove('opacity-100');
	};

	container.addEventListener('mouseenter', showZoom);
	container.addEventListener('mousemove', showZoom);
	container.addEventListener('mouseleave', hideZoom);
}

// ── Lightbox ────────────────────────────────────────────────

function initLightbox(): void {
	const dialog = document.getElementById('image-lightbox') as HTMLDialogElement | null;
	const lightboxImage = document.getElementById('lightbox-image') as HTMLImageElement | null;
	const lightboxCounter = document.getElementById('lightbox-counter');
	const closeBtn = document.getElementById('lightbox-close');
	const prevBtn = document.getElementById('lightbox-prev');
	const nextBtn = document.getElementById('lightbox-next');

	if (!dialog || !lightboxImage) return;

	const getImageSources = (): string[] => {
		const mainImg = document.getElementById('main-image') as HTMLImageElement | null;
		const thumbnails = document.querySelectorAll<HTMLButtonElement>('.thumbnail');

		if (thumbnails.length > 0) {
			return Array.from(thumbnails).map((t) => t.dataset.url || '').filter(Boolean);
		}

		return mainImg?.src ? [mainImg.src] : [];
	};

	let currentIndex = 0;
	let sources: string[] = [];

	const updateLightbox = () => {
		if (sources.length === 0) return;
		lightboxImage.src = sources[currentIndex] ?? '';
		lightboxImage.alt = `Image ${currentIndex + 1} of ${sources.length}`;

		if (lightboxCounter) {
			lightboxCounter.textContent = `${currentIndex + 1} / ${sources.length}`;
		}

		if (prevBtn) {
			prevBtn.style.display = sources.length > 1 ? '' : 'none';
		}
		if (nextBtn) {
			nextBtn.style.display = sources.length > 1 ? '' : 'none';
		}
	};

	const openLightbox = (startIndex: number = 0) => {
		sources = getImageSources();
		if (sources.length === 0) return;

		currentIndex = Math.max(0, Math.min(startIndex, sources.length - 1));
		updateLightbox();
		dialog.showModal();
	};

	const closeLightbox = () => {
		dialog.close();
	};

	const goToPrev = () => {
		if (sources.length <= 1) return;
		currentIndex = (currentIndex - 1 + sources.length) % sources.length;
		updateLightbox();
	};

	const goToNext = () => {
		if (sources.length <= 1) return;
		currentIndex = (currentIndex + 1) % sources.length;
		updateLightbox();
	};

	// Open on main image click
	const zoomContainer = document.getElementById('image-zoom-container');
	if (zoomContainer) {
		zoomContainer.addEventListener('click', () => {
			const mainImg = document.getElementById('main-image') as HTMLImageElement | null;
			if (!mainImg) return;

			const allSources = getImageSources();
			const idx = allSources.indexOf(mainImg.src);
			openLightbox(idx >= 0 ? idx : 0);
		});

		zoomContainer.addEventListener('keydown', (e: KeyboardEvent) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault();
				zoomContainer.click();
			}
		});
	}

	// Close button
	if (closeBtn) {
		closeBtn.addEventListener('click', closeLightbox);
	}

	// Prev / Next buttons
	if (prevBtn) {
		prevBtn.addEventListener('click', goToPrev);
	}
	if (nextBtn) {
		nextBtn.addEventListener('click', goToNext);
	}

	// Keyboard navigation inside dialog
	dialog.addEventListener('keydown', (e: KeyboardEvent) => {
		if (e.key === 'ArrowLeft') {
			e.preventDefault();
			goToPrev();
		} else if (e.key === 'ArrowRight') {
			e.preventDefault();
			goToNext();
		}
		// Escape is handled natively by <dialog>
	});

	// Close on backdrop click (click outside the image area)
	dialog.addEventListener('click', (e: MouseEvent) => {
		if (e.target === dialog) {
			closeLightbox();
		}
	});

	// Touch swipe support for lightbox navigation
	let touchStartX = 0;
	let touchStartY = 0;

	dialog.addEventListener('touchstart', (e: TouchEvent) => {
		const touch = e.touches[0];
		if (e.touches.length === 1 && touch) {
			touchStartX = touch.clientX;
			touchStartY = touch.clientY;
		}
	}, { passive: true });

	dialog.addEventListener('touchend', (e: TouchEvent) => {
		const touch = e.changedTouches[0];
		if (e.changedTouches.length !== 1 || !touch) return;

		const deltaX = touch.clientX - touchStartX;
		const deltaY = touch.clientY - touchStartY;
		const SWIPE_THRESHOLD = 50;

		// Only handle horizontal swipes (ignore vertical scrolling/pinch)
		if (Math.abs(deltaX) > SWIPE_THRESHOLD && Math.abs(deltaX) > Math.abs(deltaY)) {
			if (deltaX > 0) {
				goToPrev();
			} else {
				goToNext();
			}
		}
	}, { passive: true });
}

// ── Init ────────────────────────────────────────────────────

initHoverZoom();
initLightbox();
