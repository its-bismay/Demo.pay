import twilio from 'twilio';
import { env } from '../env';

const isTwilioConfigured =
  env.TWILIO_ACCOUNT_SID &&
  !env.TWILIO_ACCOUNT_SID.startsWith('AC000') &&
  env.TWILIO_AUTH_TOKEN &&
  !env.TWILIO_AUTH_TOKEN.startsWith('dev_');

const twilioClient = isTwilioConfigured
  ? twilio(env.TWILIO_ACCOUNT_SID, env.TWILIO_AUTH_TOKEN)
  : null;

export async function initiateVoiceCall(params: {
  to: string;
  customerName: string;
  productName: string;
  recoveryLink: string;
  discountPct?: number;
}): Promise<{ callSid: string }> {
  if (!twilioClient) {
    return { callSid: `mock_call_${Date.now()}` };
  }

  const twiml = `
    <Response>
      <Say voice="Polly.Aditi" language="en-IN">
        Hello ${params.customerName}, this is Demo.pay assistant. We noticed your payment for ${params.productName} was interrupted.
        ${params.discountPct ? `We have applied an exclusive ${params.discountPct} percent discount for you.` : ''}
        We have sent a secure completion link directly to your phone. Would you like to complete the payment now?
      </Say>
      <Gather input="speech" action="/api/twilio/voice/response" timeout="5" speechTimeout="auto">
        <Say voice="Polly.Aditi" language="en-IN">Please let us know if you would like us to call back later.</Say>
      </Gather>
    </Response>
  `;

  try {
    const call = await twilioClient.calls.create({
      twiml,
      to: params.to,
      from: env.TWILIO_PHONE_NUMBER,
    });
    return { callSid: call.sid };
  } catch (err: any) {
    console.warn('Twilio voice call failed:', err.message);
    return { callSid: `fallback_call_${Date.now()}` };
  }
}

export async function sendWhatsAppMessage(params: {
  to: string;
  customerName: string;
  productName: string;
  recoveryLink: string;
  discountText?: string;
}): Promise<{ messageSid: string }> {
  if (!twilioClient) {
    return { messageSid: `mock_wa_${Date.now()}` };
  }

  const body = `Hi ${params.customerName}! 👋\nYour checkout for *${params.productName}* was not completed.\n${params.discountText ? `🎁 *Special Offer:* ${params.discountText}\n` : ''}\nTap here to finish securely: ${params.recoveryLink}\n\n_Reply to this message if you have questions or want to pay later._`;

  const formattedTo = params.to.startsWith('whatsapp:') ? params.to : `whatsapp:${params.to}`;

  try {
    const message = await twilioClient.messages.create({
      body,
      from: env.TWILIO_WHATSAPP_FROM,
      to: formattedTo,
    });
    return { messageSid: message.sid };
  } catch (err: any) {
    console.warn('Twilio WhatsApp dispatch failed:', err.message);
    return { messageSid: `fallback_wa_${Date.now()}` };
  }
}
