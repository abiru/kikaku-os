import { describe, test, expect } from 'vitest';
import { renderQuotationHtml, QuotationData } from './renderQuotationHtml';
import { CompanyInfo } from '../lib/company';

describe('renderQuotationHtml', () => {
  const mockCompany: CompanyInfo = {
    name: 'Test Company',
    postal_code: '123-4567',
    address: 'Tokyo, Japan',
    phone: '03-1234-5678',
    email: 'info@test.com'
  };

  const mockQuotationData: QuotationData = {
    quotation: {
      id: 1,
      quotation_number: 'Q-2025-001',
      customer_company: 'Customer Inc.',
      customer_name: 'John Doe',
      customer_email: 'john@customer.com',
      customer_phone: '090-1234-5678',
      subtotal: 10000,
      tax_amount: 1000,
      total_amount: 11000,
      currency: 'JPY',
      valid_until: '2025-02-01T00:00:00Z',
      notes: 'Thank you for your business.',
      created_at: '2025-01-21T00:00:00Z'
    },
    items: [
      {
        product_title: 'Product A',
        variant_title: 'Size L',
        quantity: 2,
        unit_price: 3000,
        subtotal: 6000
      },
      {
        product_title: 'Product B',
        variant_title: null,
        quantity: 1,
        unit_price: 4000,
        subtotal: 4000
      }
    ]
  };

  test('generates valid HTML structure', () => {
    const html = renderQuotationHtml(mockQuotationData, mockCompany);

    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('<html lang="ja">');
    expect(html).toContain('</html>');
    expect(html).toContain('御見積書');
  });

  test('escapes XSS in quotation notes', () => {
    const xssData: QuotationData = {
      ...mockQuotationData,
      quotation: {
        ...mockQuotationData.quotation,
        notes: '<script>alert("XSS")</script>'
      }
    };

    const html = renderQuotationHtml(xssData, mockCompany);

    expect(html).not.toContain('<script>alert("XSS")</script>');
    expect(html).toContain('&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;');
  });

  test('escapes XSS in product titles', () => {
    const xssData: QuotationData = {
      ...mockQuotationData,
      items: [
        {
          product_title: '<img src=x onerror=alert("XSS")>',
          variant_title: '<script>evil()</script>',
          quantity: 1,
          unit_price: 1000,
          subtotal: 1000
        }
      ]
    };

    const html = renderQuotationHtml(xssData, mockCompany);

    expect(html).not.toContain('<img src=x onerror=alert("XSS")>');
    expect(html).not.toContain('<script>evil()</script>');
    expect(html).toContain('&lt;img src=x onerror=alert(&quot;XSS&quot;)&gt;');
    expect(html).toContain('&lt;script&gt;evil()&lt;&#x2F;script&gt;');
  });

  test('escapes XSS in customer information', () => {
    const xssData: QuotationData = {
      ...mockQuotationData,
      quotation: {
        ...mockQuotationData.quotation,
        customer_company: '<script>hack()</script>',
        customer_name: '<img src=x onerror=alert(1)>',
        customer_email: 'test@example.com"><script>evil()</script>',
        customer_phone: '090-1234-5678<script>alert(2)</script>'
      }
    };

    const html = renderQuotationHtml(xssData, mockCompany);

    expect(html).not.toContain('<script>hack()</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;script&gt;hack()&lt;&#x2F;script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  test('escapes XSS in company information', () => {
    const xssCompany: CompanyInfo = {
      name: '<script>alert("company")</script>',
      postal_code: '123-4567<script>',
      address: 'Tokyo<img src=x onerror=alert(1)>',
      phone: '03-1234-5678">"><script>',
      email: 'info@test.com<script>alert(3)</script>'
    };

    const html = renderQuotationHtml(mockQuotationData, xssCompany);

    expect(html).not.toContain('<script>alert("company")</script>');
    expect(html).not.toContain('<img src=x onerror=alert(1)>');
    expect(html).toContain('&lt;script&gt;alert(&quot;company&quot;)&lt;&#x2F;script&gt;');
  });

  test('escapes XSS in quotation number', () => {
    const xssData: QuotationData = {
      ...mockQuotationData,
      quotation: {
        ...mockQuotationData.quotation,
        quotation_number: 'Q-2025-001<script>alert("num")</script>'
      }
    };

    const html = renderQuotationHtml(xssData, mockCompany);

    expect(html).not.toContain('Q-2025-001<script>alert("num")</script>');
    expect(html).toContain('Q-2025-001&lt;script&gt;alert(&quot;num&quot;)&lt;&#x2F;script&gt;');
  });

  test('preserves Japanese characters', () => {
    const japaneseData: QuotationData = {
      ...mockQuotationData,
      quotation: {
        ...mockQuotationData.quotation,
        customer_company: '株式会社テスト',
        customer_name: '山田太郎',
        notes: 'お世話になっております。\nよろしくお願いいたします。'
      }
    };

    const html = renderQuotationHtml(japaneseData, mockCompany);

    expect(html).toContain('株式会社テスト');
    expect(html).toContain('山田太郎');
    expect(html).toContain('お世話になっております。');
    expect(html).toContain('よろしくお願いいたします。');
  });

  test('preserves newlines in notes field', () => {
    const multilineData: QuotationData = {
      ...mockQuotationData,
      quotation: {
        ...mockQuotationData.quotation,
        notes: 'Line 1\nLine 2\nLine 3'
      }
    };

    const html = renderQuotationHtml(multilineData, mockCompany);

    // Newlines should be preserved (not converted to <br> but kept for white-space: pre-wrap)
    expect(html).toContain('Line 1\nLine 2\nLine 3');
  });

  test('handles null notes gracefully', () => {
    const noNotesData: QuotationData = {
      ...mockQuotationData,
      quotation: {
        ...mockQuotationData.quotation,
        notes: null
      }
    };

    const html = renderQuotationHtml(noNotesData, mockCompany);

    expect(html).not.toContain('<div class="notes">');
    expect(html).toContain('<!DOCTYPE html>');
  });

  test('handles null variant_title gracefully', () => {
    const html = renderQuotationHtml(mockQuotationData, mockCompany);

    expect(html).toContain('Product A - Size L');
    expect(html).toContain('Product B');
    expect(html).not.toContain('Product B -');
  });

  test('handles null customer contact info gracefully', () => {
    const noContactData: QuotationData = {
      ...mockQuotationData,
      quotation: {
        ...mockQuotationData.quotation,
        customer_email: null,
        customer_phone: null
      }
    };

    const html = renderQuotationHtml(noContactData, mockCompany);

    expect(html).toContain('Customer Inc.');
    expect(html).toContain('John Doe');
    // Note: Company info still has email, so we only check customer doesn't have it
    const customerSection = html.split('<div class="info-box company">')[0];
    expect(customerSection).not.toContain('Email: john@customer.com');
    expect(customerSection).not.toContain('TEL: 090-1234-5678');
  });

  test('formats currency correctly', () => {
    const html = renderQuotationHtml(mockQuotationData, mockCompany);

    // Japanese currency format uses full-width yen sign (￥)
    expect(html).toContain('￥10,000');
    expect(html).toContain('￥1,000');
    expect(html).toContain('￥11,000');
  });

  test('includes all required sections', () => {
    const html = renderQuotationHtml(mockQuotationData, mockCompany);

    expect(html).toContain('お客様情報');
    expect(html).toContain('発行元情報');
    expect(html).toContain('発行日:');
    expect(html).toContain('有効期限:');
    expect(html).toContain('小計');
    expect(html).toContain('消費税 (10%)');
    expect(html).toContain('合計金額');
  });
});
