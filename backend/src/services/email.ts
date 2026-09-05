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

export async function sendPaymentSuccessEmail(params: {
  to: string;
  customerName: string;
  productName: string;
  orderId?: string;
  amountInRs: number;
}): Promise<void> {
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #E5E7EB; border-radius: 16px; padding: 32px; background: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-flex; align-items: center; justify-content: center; width: 64px; height: 64px; background: #ECFDF5; border-radius: 50%; margin-bottom: 16px;">
          <span style="font-size: 32px;">✅</span>
        </div>
        <h2 style="color: #065F46; margin: 0 0 8px 0; font-size: 24px; font-weight: 700;">Payment Successful!</h2>
        <p style="color: #6B7280; font-size: 15px; margin: 0;">Hi ${params.customerName}, your payment has been processed and your order is confirmed.</p>
      </div>

      <div style="background: #F9FAFB; border-radius: 12px; padding: 20px; margin: 24px 0; border: 1px solid #F3F4F6;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; color: #6B7280; font-size: 14px;">Product</td>
            <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600; text-align: right;">${params.productName}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #6B7280; font-size: 14px;">Amount Paid</td>
            <td style="padding: 6px 0; color: #059669; font-size: 16px; font-weight: 700; text-align: right;">₹${params.amountInRs.toLocaleString()}</td>
          </tr>
          ${params.orderId ? `
          <tr>
            <td style="padding: 6px 0; color: #6B7280; font-size: 13px;">Order Reference</td>
            <td style="padding: 6px 0; color: #6B7280; font-size: 13px; font-family: monospace; text-align: right;">${params.orderId.slice(0, 16)}...</td>
          </tr>` : ''}
          <tr>
            <td style="padding: 6px 0; color: #6B7280; font-size: 14px;">Payment Status</td>
            <td style="padding: 6px 0; color: #059669; font-size: 14px; font-weight: 600; text-align: right;">Captured (Paid)</td>
          </tr>
        </table>
      </div>

      <p style="color: #374151; font-size: 14px; line-height: 1.6; margin: 0 0 16px 0;">
        Thank you for shopping with us on Demo.pay! No further action or voice phone call is needed.
      </p>

      <div style="border-top: 1px solid #E5E7EB; margin-top: 24px; padding-top: 16px; text-align: center;">
        <p style="color: #9CA3AF; font-size: 12px; margin: 0;">
          Demo.pay Autonomous Recovery &amp; Payment Gateway Engine
        </p>
      </div>
    </div>
  `;

  try {
    const res = await fetch(env.EMAIL_SERVICE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: params.to,
        subject: `Payment Successful! Your Demo.pay Order is confirmed`,
        text_content: `Hi ${params.customerName}! Your payment of ₹${params.amountInRs.toLocaleString()} for ${params.productName} was received successfully. Order confirmed!`,
        html_content: html,
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      console.warn(`Email service returned ${res.status}: ${body}`);
    } else {
      console.log(`Payment success confirmation email sent to ${params.to}`);
    }
  } catch (err: any) {
    console.warn('Failed to send payment confirmation email:', err.message);
  }
}

