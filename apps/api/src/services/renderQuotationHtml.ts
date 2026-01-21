import { CompanyInfo } from '../lib/company';
import { escapeHtml } from '../lib/html';

export type QuotationData = {
  quotation: {
    id: number;
    quotation_number: string;
    customer_company: string;
    customer_name: string;
    customer_email: string | null;
    customer_phone: string | null;
    subtotal: number;
    tax_amount: number;
    total_amount: number;
    currency: string;
    valid_until: string;
    notes: string | null;
    created_at: string;
  };
  items: Array<{
    product_title: string;
    variant_title: string | null;
    quantity: number;
    unit_price: number;
    subtotal: number;
  }>;
};

export const renderQuotationHtml = (data: QuotationData, company: CompanyInfo): string => {
  const { quotation, items } = data;

  const formatCurrency = (amount: number, currency: string = 'JPY') => {
    return new Intl.NumberFormat('ja-JP', {
      style: 'currency',
      currency: currency
    }).format(amount);
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('ja-JP', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(date);
  };

  const style = `
    @media print {
      body { margin: 0; }
      .no-print { display: none; }
    }
    body {
      font-family: 'Hiragino Kaku Gothic Pro', 'Yu Gothic', 'Meiryo', sans-serif;
      background: #fff;
      color: #000;
      margin: 0;
      padding: 40px;
      font-size: 12pt;
      line-height: 1.6;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
    }
    .header {
      text-align: center;
      margin-bottom: 40px;
      border-bottom: 2px solid #000;
      padding-bottom: 20px;
    }
    .header h1 {
      font-size: 24pt;
      margin: 0 0 10px;
      font-weight: bold;
    }
    .header .quotation-number {
      font-size: 14pt;
      color: #666;
    }
    .info-section {
      display: flex;
      justify-content: space-between;
      margin-bottom: 30px;
    }
    .info-box {
      flex: 1;
      padding: 15px;
    }
    .info-box.company {
      text-align: right;
      border-right: 1px solid #ddd;
    }
    .info-box.customer {
      text-align: left;
    }
    .info-box h2 {
      font-size: 11pt;
      margin: 0 0 10px;
      font-weight: bold;
      border-bottom: 1px solid #000;
      padding-bottom: 5px;
    }
    .info-box p {
      margin: 5px 0;
      font-size: 10pt;
    }
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    .items-table th,
    .items-table td {
      border: 1px solid #000;
      padding: 10px;
      text-align: left;
      font-size: 10pt;
    }
    .items-table th {
      background: #f0f0f0;
      font-weight: bold;
      text-align: center;
    }
    .items-table td.number {
      text-align: right;
    }
    .items-table td.center {
      text-align: center;
    }
    .summary {
      margin-left: auto;
      width: 300px;
      border-collapse: collapse;
    }
    .summary tr {
      border-bottom: 1px solid #ddd;
    }
    .summary td {
      padding: 8px;
      font-size: 11pt;
    }
    .summary td.label {
      text-align: left;
      font-weight: bold;
    }
    .summary td.amount {
      text-align: right;
    }
    .summary tr.total td {
      font-size: 14pt;
      font-weight: bold;
      border-top: 2px solid #000;
      padding-top: 12px;
    }
    .notes {
      margin-top: 30px;
      padding: 15px;
      background: #f9f9f9;
      border: 1px solid #ddd;
    }
    .notes h3 {
      font-size: 11pt;
      margin: 0 0 10px;
      font-weight: bold;
    }
    .notes p {
      font-size: 10pt;
      margin: 5px 0;
      white-space: pre-wrap;
    }
    .footer {
      margin-top: 40px;
      text-align: center;
      font-size: 9pt;
      color: #666;
      border-top: 1px solid #ddd;
      padding-top: 15px;
    }
  `;

  const itemsHtml = items
    .map(
      (item, index) => `
    <tr>
      <td class="center">${index + 1}</td>
      <td>${escapeHtml(item.product_title)}${item.variant_title ? ` - ${escapeHtml(item.variant_title)}` : ''}</td>
      <td class="number">${item.quantity}</td>
      <td class="number">${formatCurrency(item.unit_price, quotation.currency)}</td>
      <td class="number">${formatCurrency(item.subtotal, quotation.currency)}</td>
    </tr>
  `
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>御見積書 - ${escapeHtml(quotation.quotation_number)}</title>
  <style>${style}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>御見積書</h1>
      <div class="quotation-number">${escapeHtml(quotation.quotation_number)}</div>
    </div>

    <div class="info-section">
      <div class="info-box customer">
        <h2>お客様情報</h2>
        <p><strong>${escapeHtml(quotation.customer_company)} 様</strong></p>
        <p>${escapeHtml(quotation.customer_name)} 様</p>
        ${quotation.customer_email ? `<p>Email: ${escapeHtml(quotation.customer_email)}</p>` : ''}
        ${quotation.customer_phone ? `<p>TEL: ${escapeHtml(quotation.customer_phone)}</p>` : ''}
      </div>

      <div class="info-box company">
        <h2>発行元情報</h2>
        <p><strong>${escapeHtml(company.name)}</strong></p>
        ${company.postal_code ? `<p>〒${escapeHtml(company.postal_code)}</p>` : ''}
        ${company.address ? `<p>${escapeHtml(company.address)}</p>` : ''}
        ${company.phone ? `<p>TEL: ${escapeHtml(company.phone)}</p>` : ''}
        ${company.email ? `<p>Email: ${escapeHtml(company.email)}</p>` : ''}
      </div>
    </div>

    <p><strong>発行日:</strong> ${formatDate(quotation.created_at)}</p>
    <p><strong>有効期限:</strong> ${formatDate(quotation.valid_until)}</p>

    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 50px;">No.</th>
          <th>品名</th>
          <th style="width: 80px;">数量</th>
          <th style="width: 120px;">単価</th>
          <th style="width: 120px;">小計</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <table class="summary">
      <tr>
        <td class="label">小計</td>
        <td class="amount">${formatCurrency(quotation.subtotal, quotation.currency)}</td>
      </tr>
      <tr>
        <td class="label">消費税 (10%)</td>
        <td class="amount">${formatCurrency(quotation.tax_amount, quotation.currency)}</td>
      </tr>
      <tr class="total">
        <td class="label">合計金額</td>
        <td class="amount">${formatCurrency(quotation.total_amount, quotation.currency)}</td>
      </tr>
    </table>

    ${
      quotation.notes
        ? `
    <div class="notes">
      <h3>備考</h3>
      <p>${escapeHtml(quotation.notes)}</p>
    </div>
    `
        : ''
    }

    <div class="footer">
      <p>本見積書は${formatDate(quotation.valid_until)}まで有効です。</p>
      <p>ご不明な点がございましたら、お気軽にお問い合わせください。</p>
    </div>
  </div>
</body>
</html>`;
};
