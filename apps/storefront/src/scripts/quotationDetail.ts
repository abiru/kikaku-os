import DOMPurify from 'isomorphic-dompurify';
import { acceptQuotation, fetchQuotationHtml } from '../lib/quotationApi';

declare global {
  interface Window {
    __QUOTATION_PAGE__: {
      apiUrl: string;
      quotationToken: string;
      quotationNumber: string;
      i18n: {
        pdf: string;
        generatingPdf: string;
        pdfLoadError: string;
        pdfDownloadError: string;
        orderFromQuotation: string;
        processing: string;
        checkoutUrlError: string;
        acceptError: string;
        confirmOrder: string;
      };
    };
    html2pdf?: () => {
      set: (options: unknown) => {
        from: (element: Element) => {
          save: () => Promise<void>;
        };
      };
    };
  }
}

const { apiUrl, quotationToken, quotationNumber, i18n } = window.__QUOTATION_PAGE__;

const handleDownloadPDF = async () => {
  const btn = document.getElementById('download-pdf-btn') as HTMLButtonElement | null;
  const errorMessageEl = document.getElementById('error-message');

  if (!btn || !errorMessageEl) return;

  btn.disabled = true;
  btn.textContent = i18n.generatingPdf;
  errorMessageEl.style.display = 'none';

  try {
    const html = await fetchQuotationHtml(apiUrl, quotationToken);

    // Load html2pdf.js dynamically
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    script.onload = () => {
      // Create temporary container
      const container = document.createElement('div');
      container.innerHTML = DOMPurify.sanitize(html);
      container.style.position = 'absolute';
      container.style.left = '-9999px';
      document.body.appendChild(container);

      // Generate PDF
      const opt = {
        margin: 10,
        filename: `見積書_${quotationNumber}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
      };

      if (!window.html2pdf) {
        throw new Error(i18n.pdfLoadError);
      }

      window.html2pdf().set(opt).from(container).save().then(() => {
        document.body.removeChild(container);
        btn.disabled = false;
        btn.textContent = i18n.pdf;
      });
    };
    script.onerror = () => {
      throw new Error(i18n.pdfLoadError);
    };
    document.head.appendChild(script);
  } catch (error) {
    console.error('Error downloading PDF:', error);
    errorMessageEl.textContent = error instanceof Error ? error.message : i18n.pdfDownloadError;
    errorMessageEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = i18n.pdf;
  }
};

const handleAccept = async () => {
  const btn = document.getElementById('accept-btn') as HTMLButtonElement | null;
  const errorMessageEl = document.getElementById('error-message');

  if (!btn || !errorMessageEl || !confirm(i18n.confirmOrder)) return;

  btn.disabled = true;
  btn.textContent = i18n.processing;
  errorMessageEl.style.display = 'none';

  try {
    const data = await acceptQuotation(apiUrl, quotationToken);

    // Redirect to Stripe Checkout
    if (data.checkoutUrl) {
      window.location.href = String(data.checkoutUrl);
    } else {
      throw new Error(i18n.checkoutUrlError);
    }
  } catch (error) {
    console.error('Error accepting quotation:', error);
    errorMessageEl.textContent = error instanceof Error ? error.message : i18n.acceptError;
    errorMessageEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = i18n.orderFromQuotation;
  }
};

// Attach event listeners
const downloadBtn = document.getElementById('download-pdf-btn');
const acceptBtn = document.getElementById('accept-btn');

if (downloadBtn) {
  downloadBtn.addEventListener('click', handleDownloadPDF);
}

if (acceptBtn) {
  acceptBtn.addEventListener('click', handleAccept);
}
