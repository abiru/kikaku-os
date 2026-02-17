import { Env } from '../../env';
import { sendEmail } from '../email';

export const sendBankTransferInstructionsEmail = async (
  env: Env['Bindings'],
  params: {
    customerEmail: string;
    orderId: number;
    amount: number;
    currency: string;
    bankTransferInstructions: {
      type?: string;
      financial_addresses?: Array<{
        type: string;
        zengin?: {
          bank_name?: string;
          branch_name?: string;
          account_type?: string;
          account_number?: string;
          account_holder_name?: string;
        };
      }>;
      hosted_instructions_url?: string;
    };
  }
): Promise<void> => {
  const { customerEmail, orderId, amount, currency, bankTransferInstructions } = params;

  // Extract zengin (Japanese bank) details
  const zenginAddr = bankTransferInstructions.financial_addresses?.find(
    (addr) => addr.type === 'zengin'
  )?.zengin;

  const bankDetails = zenginAddr
    ? `<table style="border-collapse:collapse;width:100%;margin:16px 0;">
        <tr><td style="padding:8px;border:1px solid #e5e5e5;background:#f9f9f9;font-weight:600;">銀行名</td><td style="padding:8px;border:1px solid #e5e5e5;">${zenginAddr.bank_name || '-'}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e5e5;background:#f9f9f9;font-weight:600;">支店名</td><td style="padding:8px;border:1px solid #e5e5e5;">${zenginAddr.branch_name || '-'}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e5e5;background:#f9f9f9;font-weight:600;">口座種別</td><td style="padding:8px;border:1px solid #e5e5e5;">${zenginAddr.account_type === 'futsu' ? '普通' : zenginAddr.account_type || '-'}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e5e5;background:#f9f9f9;font-weight:600;">口座番号</td><td style="padding:8px;border:1px solid #e5e5e5;">${zenginAddr.account_number || '-'}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e5e5;background:#f9f9f9;font-weight:600;">口座名義</td><td style="padding:8px;border:1px solid #e5e5e5;">${zenginAddr.account_holder_name || '-'}</td></tr>
      </table>`
    : '<p>振込先情報はStripeから提供される案内ページをご確認ください。</p>';

  const formattedAmount = new Intl.NumberFormat('ja-JP', { style: 'currency', currency }).format(amount);

  const hostedUrl = bankTransferInstructions.hosted_instructions_url;
  const hostedLink = hostedUrl
    ? `<p style="margin-top:16px;"><a href="${hostedUrl}" style="color:#0071e3;">振込先の詳細はこちら</a></p>`
    : '';

  const html = `
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:600px;margin:0 auto;color:#1d1d1f;">
      <h2 style="font-size:20px;font-weight:600;">銀行振込のご案内</h2>
      <p>ご注文ありがとうございます。以下の口座にお振込みをお願いいたします。</p>

      <p style="margin:16px 0;"><strong>注文番号:</strong> #${orderId}</p>
      <p><strong>お振込金額:</strong> ${formattedAmount}</p>

      <h3 style="font-size:16px;font-weight:600;margin-top:24px;">振込先口座情報</h3>
      ${bankDetails}
      ${hostedLink}

      <p style="margin-top:24px;color:#86868b;font-size:13px;">
        お振込みの確認後、自動的に注文が確定されます。<br>
        ご不明な点がございましたら、お問い合わせください。
      </p>
    </div>
  `;

  const text = `銀行振込のご案内

ご注文ありがとうございます。以下の口座にお振込みをお願いいたします。

注文番号: #${orderId}
お振込金額: ${formattedAmount}

${zenginAddr ? `振込先口座情報:
銀行名: ${zenginAddr.bank_name || '-'}
支店名: ${zenginAddr.branch_name || '-'}
口座種別: ${zenginAddr.account_type === 'futsu' ? '普通' : zenginAddr.account_type || '-'}
口座番号: ${zenginAddr.account_number || '-'}
口座名義: ${zenginAddr.account_holder_name || '-'}` : '振込先情報はStripeの案内ページをご確認ください。'}

${hostedUrl ? `振込先の詳細: ${hostedUrl}` : ''}

お振込みの確認後、自動的に注文が確定されます。
ご不明な点がございましたら、お問い合わせください。`;

  await sendEmail(env, {
    to: customerEmail,
    subject: `【Led Kikaku】銀行振込のご案内（注文 #${orderId}）`,
    html,
    text,
  });
};
