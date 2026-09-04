import { env } from '../env';
import { FailureMode } from '../services/ruleEngine';

export interface DiagnosisResult {
  rootCause: string;
  confidence: number;
  recommendedChannels: Array<'VOICE' | 'WHATSAPP' | 'EMAIL'>;
  recommendedDiscountPct: number;
  reasoning: string;
}

export async function runDiagnosisAgent(params: {
  failureMode: FailureMode;
  amountInPaise: number;
  customerName: string;
  historyCount: number;
  policy: any;
}): Promise<DiagnosisResult> {
  const { failureMode, amountInPaise, customerName, historyCount, policy } = params;

  if (env.GOOGLE_API_KEY && !env.GOOGLE_API_KEY.startsWith('dev_')) {
    try {
      const prompt = `You are an AI Revenue Recovery Diagnosis Agent for an e-commerce store.
Customer: ${customerName}
Failure Mode: ${failureMode}
Amount: ₹${(amountInPaise / 100).toFixed(2)}
Previous Failed Attempts: ${historyCount}
Merchant Policy: Max Discount ${policy?.maxDiscountPct ?? 15}%, Min Order for Voice: ₹${((policy?.minOrderValuePaise ?? 200000) / 100).toFixed(2)}

Respond with strict JSON only in this schema:
{
  "rootCause": string,
  "confidence": number between 0 and 1,
  "recommendedChannels": array containing one or more of ["VOICE", "WHATSAPP", "EMAIL"],
  "recommendedDiscountPct": integer percentage up to max allowed,
  "reasoning": string summarizing diagnosis and strategy
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
            rootCause: parsed.rootCause ?? failureMode,
            confidence: parsed.confidence ?? 0.95,
            recommendedChannels: parsed.recommendedChannels ?? ['EMAIL', 'WHATSAPP'],
            recommendedDiscountPct: Math.min(
              parsed.recommendedDiscountPct ?? 10,
              policy?.maxDiscountPct ?? 15
            ),
            reasoning: parsed.reasoning ?? `Diagnosed ${failureMode} for order value ₹${amountInPaise / 100}`,
          };
        }
      }
    } catch (err) {
      console.warn('Gemini API call failed, using rule-based diagnostic fallback:', (err as Error).message);
    }
  }

  const isHighValue = amountInPaise >= (policy?.minOrderValuePaise ?? 200000);
  const channels: Array<'VOICE' | 'WHATSAPP' | 'EMAIL'> = ['EMAIL'];

  if (failureMode === 'INSUFFICIENT_FUNDS') {
    channels.push('WHATSAPP');
    if (isHighValue) channels.push('VOICE');
    return {
      rootCause: 'Customer encountered insufficient funds during UPI authorization.',
      confidence: 0.92,
      recommendedChannels: channels,
      recommendedDiscountPct: Math.min(10, policy?.maxDiscountPct ?? 15),
      reasoning: `Identified INSUFFICIENT_FUNDS on ₹${amountInPaise / 100}. Nudging via ${channels.join(' and ')} with a 10% discount incentive.`,
    };
  }

  if (failureMode === 'GATEWAY_TIMEOUT' || failureMode === 'UPI_UNREACHABLE') {
    channels.push('WHATSAPP');
    if (isHighValue) channels.push('VOICE');
    return {
      rootCause: 'Bank server timeout or UPI network unreachable during checkout.',
      confidence: 0.88,
      recommendedChannels: channels,
      recommendedDiscountPct: 0,
      reasoning: `Technical network failure identified (${failureMode}). Dispatched retry link immediately before cart abandonment.`,
    };
  }

  if (failureMode === 'CHECKOUT_ABANDONED') {
    channels.push('WHATSAPP');
    return {
      rootCause: 'Customer abandoned active cart before payment initiation.',
      confidence: 0.85,
      recommendedChannels: channels,
      recommendedDiscountPct: Math.min(5, policy?.maxDiscountPct ?? 15),
      reasoning: `Cart abandonment detected. Sending gentle recovery email and WhatsApp with 5% discount nudge.`,
    };
  }

  channels.push('WHATSAPP');
  return {
    rootCause: `Payment failed due to ${failureMode}.`,
    confidence: 0.8,
    recommendedChannels: channels,
    recommendedDiscountPct: 0,
    reasoning: `Automated rule diagnosis for ${failureMode}. Recommending recovery link dispatch.`,
  };
}
