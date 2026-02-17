/**
 * Centralized scroll-reveal system using IntersectionObserver.
 *
 * Usage: Add `data-reveal` to any element. Optionally set
 * `data-reveal-delay="50"` (ms) on children for staggered animation.
 *
 * CSS classes applied: `.is-revealed` triggers the fade-up transition.
 * Respects `prefers-reduced-motion`.
 */

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function revealElement(el: Element) {
  el.classList.add('is-revealed');

  const staggerDelay = el.getAttribute('data-reveal-delay');
  if (!staggerDelay) return;

  const delayMs = parseInt(staggerDelay, 10);
  if (Number.isNaN(delayMs)) return;

  const children = el.querySelectorAll('[data-reveal-child]');
  children.forEach((child, index) => {
    (child as HTMLElement).style.transitionDelay = `${index * delayMs}ms`;
    child.classList.add('is-revealed');
  });
}

function initScrollReveal() {
  if (prefersReducedMotion) {
    document.querySelectorAll('[data-reveal]').forEach((el) => {
      el.classList.add('is-revealed');
      el.querySelectorAll('[data-reveal-child]').forEach((child) => {
        child.classList.add('is-revealed');
      });
    });
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          revealElement(entry.target);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );

  document.querySelectorAll('[data-reveal]').forEach((el) => {
    observer.observe(el);
  });
}

// Run on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initScrollReveal);
} else {
  initScrollReveal();
}

// Re-run after Astro view transitions
document.addEventListener('astro:after-swap', initScrollReveal);
