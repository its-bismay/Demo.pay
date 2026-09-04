import { env } from '../env';

export async function sendRecoveryEmail(params: {
  to: string;
  customerName: string;
  productName: string;
  recoveryLink: string;
  discountText?: string;
}): Promise<void> {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;border:1px solid #E5E7EB;border-radius:12px;padding:24px;">
      <h2 style="color:#4F46E5;margin-top:0;">Hi ${params.customerName},</h2>
      <p style="color:#374151;font-size:16px;">Your payment for <strong>${params.productName}</strong> couldn't go through.</p>
      ${
        params.discountText
          ? `<p style="background:#F0FDF4;padding:12px;border-radius:8px;color:#166534;font-weight:600;">${params.discountText}</p>`
          : ''
      }
      <div style="margin:24px 0;">
        <a href="${params.recoveryLink}" style="display:inline-block;background:#4F46E5;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:bold;">
          Complete Payment →
        </a>
      </div>
      <p style="color:#6B7280;font-size:14px;margin-bottom:0;">This recovery link expires in 24 hours.</p>
    </div>
  `;

  try {
    const res = await fetch(env.EMAIL_SERVICE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: params.to,
        subject: `Complete your order on Demo.pay`,
        text_content: `Hi ${params.customerName}, complete your payment: ${params.recoveryLink}`,
        html_content: html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.warn(`Email service returned ${res.status}: ${body}`);
    }
  } catch (err: any) {
    console.warn('Failed to send recovery email via external service:', err.message);
  }
}
