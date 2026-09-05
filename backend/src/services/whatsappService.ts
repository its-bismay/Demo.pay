import { env } from '../env';

const isConfigured =
  Boolean(env.META_WHATSAPP_TOKEN) &&
  !env.META_WHATSAPP_TOKEN.startsWith('dev_') &&
  Boolean(env.META_WHATSAPP_PHONE_ID) &&
  !env.META_WHATSAPP_PHONE_ID.startsWith('dev_');

export async function sendWhatsAppMessage(params: {
  to: string;
  customerName: string;
  productName: string;
  recoveryLink: string;
  discountText?: string;
  customMessage?: string;
}): Promise<{ messageSid: string; success: boolean; error?: string }> {
  if (!isConfigured) {
    return { messageSid: `mock_meta_wa_${Date.now()}`, success: false, error: 'Meta WhatsApp credentials not configured in backend/.env' };
  }

  const cleanPhone = params.to.replace(/[^\d]/g, '');
  const formattedPhone = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;

  const defaultBody = `Hi ${params.customerName}! 👋\n\nYour checkout for *${params.productName}* was not completed.\n${params.discountText ? `🎁 *Special Offer:* ${params.discountText}\n` : ''}\nTap here to complete your order securely: ${params.recoveryLink}\n\nReply to this message if you have questions or would like to schedule payment for later.`;

  const body = params.customMessage || defaultBody;

  try {
    const res = await fetch(`https://graph.facebook.com/v22.0/${env.META_WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.META_WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: formattedPhone,
        type: 'text',
        text: {
          preview_url: true,
          body,
        },
      }),
    });

    if (!res.ok) {
      const errData = (await res.json().catch(() => ({}))) as any;
      const errMsg = errData?.error?.message || `HTTP ${res.status}`;
      console.warn('Meta WhatsApp API dispatch error:', JSON.stringify(errData));
      return { messageSid: `fallback_meta_wa_${Date.now()}`, success: false, error: errMsg };
    }

    const data = await res.json() as any;
    const messageId = data?.messages?.[0]?.id ?? `meta_wa_${Date.now()}`;
    console.log(`[Meta WhatsApp] Successfully dispatched message to ${formattedPhone}. Message ID: ${messageId}`);
    return { messageSid: messageId, success: true };
  } catch (err: any) {
    console.warn('Meta WhatsApp network error:', err?.message);
    return { messageSid: `fallback_meta_wa_${Date.now()}`, success: false, error: err?.message || 'Network error' };
  }
}
