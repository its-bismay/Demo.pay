import { LlmAgent, InMemoryRunner } from '@google/adk';
import { env } from '../env';
import { executeWithGeminiRateLimit } from '../services/geminiRateLimiter';

const hasValidGeminiKey =
  Boolean(env.GOOGLE_API_KEY) &&
  !env.GOOGLE_API_KEY.startsWith('dev_');

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

  const fallbackCopy = (): InterventionCopy => ({
    voiceScript: `Hello ${customerName}, main Demo.pay recovery desk se baat kar raha hoon. Maine dekha aapka ${productName} ka order complete nahi ho paya tha. Kya main payment complete karne mein aapki koi madad kar sakta hoon?`,
    whatsappMessage: `Hi ${customerName}! 👋 Humne dekha ki aapka *${productName}* ka payment complete nahi hua. Aapke liye special *${discountPct}% off* add kiya hai! Order yahan complete karein: ${recoveryLink}`,
    emailSubject: `Special ${discountPct}% Off: Complete your order for ${productName}`,
    emailBody: `Hi ${customerName}, your payment for ${productName} was interrupted. Click the link below to resume with your exclusive ${discountPct}% discount.`,
    discountPct,
  });

  if (!hasValidGeminiKey) {
    return fallbackCopy();
  }

  return executeWithGeminiRateLimit(
    async () => {
      const agent = new LlmAgent({
        name: 'intervention_copy_agent',
        model: 'gemini-3.5-flash-lite',
        instruction: `You are an AI Revenue Recovery Copywriter for Demo.pay.
Persona: ${policy?.personaPrompt ?? 'Empathetic, helpful, friendly support assistant.'}
Language: ${policy?.languageMode ?? 'Hinglish'}

Return strict JSON only without formatting wrappers:
{
  "voiceScript": "concise spoken phone pitch in Hinglish",
  "whatsappMessage": "friendly WhatsApp copy with clean formatting",
  "emailSubject": "compelling recovery subject line",
  "emailBody": "helpful email body"
}`,
      });

      const runner = new InMemoryRunner({ agent });
      let agentOutput = '';

      const prompt = `Generate recovery copy:
Customer: ${customerName}
Product: ${productName}
Amount: ₹${amountInPaise / 100}
Failure: ${failureMode}
Discount: ${discountPct}%
Recovery Link: ${recoveryLink}`;

      for await (const event of runner.runEphemeral({
        userId: 'system',
        newMessage: {
          role: 'user',
          parts: [{ text: prompt }],
        },
      })) {
        const parts = event.content?.parts;
        if (Array.isArray(parts)) {
          for (const p of parts) {
            if (p.text) agentOutput += p.text;
          }
        }
      }

      const cleanJson = agentOutput.replace(/```json/g, '').replace(/```/g, '').trim();
      if (cleanJson) {
        const parsed = JSON.parse(cleanJson);
        return {
          voiceScript: parsed.voiceScript || `Hello ${customerName}, main Demo.pay recovery desk se baat kar raha hoon.`,
          whatsappMessage: parsed.whatsappMessage || `Hi ${customerName}! Your checkout for ${productName} is saved: ${recoveryLink}`,
          emailSubject: parsed.emailSubject || `Complete your order for ${productName}`,
          emailBody: parsed.emailBody || `Hi ${customerName}, finish your checkout here: ${recoveryLink}`,
          discountPct,
        };
      }
      return fallbackCopy();
    },
    fallbackCopy,
    600
  );
}
