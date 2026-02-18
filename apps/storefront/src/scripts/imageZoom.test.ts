import { beforeEach, describe, expect, it, vi } from 'vitest';

const loadScript = async () => {
	vi.resetModules();
	await import('./imageZoom');
};

describe('imageZoom script', () => {
	beforeEach(() => {
		document.body.innerHTML = '';
	});

	describe('hover zoom', () => {
		it('shows zoom overlay on mouseenter and hides on mouseleave', async () => {
			document.body.innerHTML = `
				<div id="image-zoom-container" style="width:400px;height:400px;">
					<img id="main-image" src="/product.png" alt="Product" />
					<div id="zoom-overlay" class="opacity-0 pointer-events-none"></div>
				</div>
			`;

			await loadScript();

			const container = document.getElementById('image-zoom-container')!;
			const overlay = document.getElementById('zoom-overlay')!;

			// Simulate mouseenter
			container.dispatchEvent(new MouseEvent('mouseenter', { clientX: 200, clientY: 200, bubbles: true }));

			expect(overlay.classList.contains('opacity-100')).toBe(true);
			expect(overlay.classList.contains('pointer-events-none')).toBe(false);
			expect(overlay.style.backgroundImage).toContain('/product.png');

			// Simulate mouseleave
			container.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }));

			expect(overlay.classList.contains('opacity-0')).toBe(true);
			expect(overlay.classList.contains('pointer-events-none')).toBe(true);
		});
	});

	describe('lightbox', () => {
		const createLightboxHTML = () => `
			<div id="image-zoom-container" tabindex="0" role="button">
				<img id="main-image" src="/img1.png" alt="Image 1" />
				<div id="zoom-overlay" class="opacity-0 pointer-events-none"></div>
			</div>
			<button class="thumbnail" data-url="/img1.png"></button>
			<button class="thumbnail" data-url="/img2.png"></button>
			<button class="thumbnail" data-url="/img3.png"></button>
			<dialog id="image-lightbox">
				<button id="lightbox-close"></button>
				<button id="lightbox-prev"></button>
				<img id="lightbox-image" src="" alt="" />
				<button id="lightbox-next"></button>
				<span id="lightbox-counter"></span>
			</dialog>
		`;

		it('opens lightbox when the zoom container is clicked', async () => {
			document.body.innerHTML = createLightboxHTML();

			// Mock dialog showModal/close
			const dialog = document.getElementById('image-lightbox') as HTMLDialogElement;
			dialog.showModal = vi.fn();
			dialog.close = vi.fn();

			await loadScript();

			const container = document.getElementById('image-zoom-container')!;
			container.click();

			expect(dialog.showModal).toHaveBeenCalled();
			expect((document.getElementById('lightbox-image') as HTMLImageElement).src).toContain('/img1.png');
		});

		it('navigates to next image on next button click', async () => {
			document.body.innerHTML = createLightboxHTML();

			const dialog = document.getElementById('image-lightbox') as HTMLDialogElement;
			dialog.showModal = vi.fn();
			dialog.close = vi.fn();

			await loadScript();

			// Open lightbox
			document.getElementById('image-zoom-container')!.click();

			// Click next
			document.getElementById('lightbox-next')!.click();

			const lightboxImg = document.getElementById('lightbox-image') as HTMLImageElement;
			expect(lightboxImg.src).toContain('/img2.png');
			expect(document.getElementById('lightbox-counter')?.textContent).toBe('2 / 3');
		});

		it('navigates to previous image on prev button click', async () => {
			document.body.innerHTML = createLightboxHTML();

			const dialog = document.getElementById('image-lightbox') as HTMLDialogElement;
			dialog.showModal = vi.fn();
			dialog.close = vi.fn();

			await loadScript();

			// Open lightbox
			document.getElementById('image-zoom-container')!.click();

			// Click prev (should wrap to last image)
			document.getElementById('lightbox-prev')!.click();

			const lightboxImg = document.getElementById('lightbox-image') as HTMLImageElement;
			expect(lightboxImg.src).toContain('/img3.png');
			expect(document.getElementById('lightbox-counter')?.textContent).toBe('3 / 3');
		});

		it('closes lightbox when close button is clicked', async () => {
			document.body.innerHTML = createLightboxHTML();

			const dialog = document.getElementById('image-lightbox') as HTMLDialogElement;
			dialog.showModal = vi.fn();
			dialog.close = vi.fn();

			await loadScript();

			// Open then close
			document.getElementById('image-zoom-container')!.click();
			document.getElementById('lightbox-close')!.click();

			expect(dialog.close).toHaveBeenCalled();
		});

		it('navigates with arrow keys inside dialog', async () => {
			document.body.innerHTML = createLightboxHTML();

			const dialog = document.getElementById('image-lightbox') as HTMLDialogElement;
			dialog.showModal = vi.fn();
			dialog.close = vi.fn();

			await loadScript();

			// Open lightbox
			document.getElementById('image-zoom-container')!.click();

			// Press ArrowRight
			dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
			expect((document.getElementById('lightbox-image') as HTMLImageElement).src).toContain('/img2.png');

			// Press ArrowLeft
			dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
			expect((document.getElementById('lightbox-image') as HTMLImageElement).src).toContain('/img1.png');
		});

		it('opens lightbox on Enter key press', async () => {
			document.body.innerHTML = createLightboxHTML();

			const dialog = document.getElementById('image-lightbox') as HTMLDialogElement;
			dialog.showModal = vi.fn();
			dialog.close = vi.fn();

			await loadScript();

			const container = document.getElementById('image-zoom-container')!;
			container.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

			expect(dialog.showModal).toHaveBeenCalled();
		});

		it('closes lightbox on backdrop click', async () => {
			document.body.innerHTML = createLightboxHTML();

			const dialog = document.getElementById('image-lightbox') as HTMLDialogElement;
			dialog.showModal = vi.fn();
			dialog.close = vi.fn();

			await loadScript();

			// Open lightbox
			document.getElementById('image-zoom-container')!.click();

			// Click on dialog itself (backdrop)
			dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));

			expect(dialog.close).toHaveBeenCalled();
		});
	});
});
