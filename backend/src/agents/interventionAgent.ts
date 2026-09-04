import { env } from '../env';

export interface InterventionCopy {
  voiceScript: string;
  whatsappMessage: string;
  emailSubject: string;
  emailBody: string;
  discountPct: number;
}

export async function generateInterventionCopy(params: {
  customerName: string;
  productName: string;
  amountInPaise: number;
  failureMode: string;
  recoveryLink: string;
  policy: any;
}): Promise<InterventionCopy> {
  const { customerName, productName, amountInPaise, failureMode, recoveryLink, policy } = params;
  const maxDiscount = policy?.maxDiscountPct ?? 15;
  const discountPct = Math.min(10, maxDiscount);

  if (env.GOOGLE_API_KEY && !env.GOOGLE_API_KEY.startsWith('dev_')) {
    try {
      const prompt = `You are an AI Revenue Recovery Copy Agent for Demo.pay.
Persona: ${policy?.personaPrompt ?? 'Empathetic, helpful, friendly support assistant.'}
Language: ${policy?.languageMode ?? 'Hinglish'}
Customer: ${customerName}
Product: ${productName}
Amount: ₹${amountInPaise / 100}
Failure Mode: ${failureMode}
Discount Offered: ${discountPct}%
Recovery Link: ${recoveryLink}

Return JSON with:
{
  "voiceScript": "script for phone call in persona",
  "whatsappMessage": "WhatsApp message with emojis",
  "emailSubject": "Compelling subject line",
  "emailBody": "Friendly message text",
  "discountPct": ${discountPct}
}`;

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${env.GOOGLE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      );

      if (res.ok) {
        const data = (await res.json()) as any;
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          const parsed = JSON.parse(text);
          return {
            voiceScript: parsed.voiceScript,
            whatsappMessage: parsed.whatsappMessage,
            emailSubject: parsed.emailSubject,
            emailBody: parsed.emailBody,
            discountPct,
          };
        }
      }
    } catch (err) {
      console.warn('Intervention copy generation fallback:', (err as Error).message);
    }
  }

  return {
    voiceScript: `Hello ${customerName}, main Demo.pay se baat kar rahi hoon. Aapka ${productName} ka order complete nahi ho paya. Humne aapke liye ek special ${discountPct}% discount add kiya hai. Kya aap abhi payment complete karna chahenge?`,
    whatsappMessage: `Hi ${customerName}! 👋 Humne dekha ki aapka *${productName}* ka payment complete nahi hua. Aapke liye special *${discountPct}% off* add kiya hai! Order yahan complete karein: ${recoveryLink}`,
    emailSubject: `Special ${discountPct}% Off: Complete your order for ${productName}`,
    emailBody: `Hi ${customerName}, your payment for ${productName} was interrupted. Click the link below to resume with your exclusive ${discountPct}% discount.`,
    discountPct,
  };
}
