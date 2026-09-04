import { LlmAgent, InMemoryRunner, FunctionTool } from '@google/adk';
import { z } from 'zod';
import { env } from '../env';
import { executeWithGeminiRateLimit } from '../services/geminiRateLimiter';

const hasValidGeminiKey =
  Boolean(env.GOOGLE_API_KEY) &&
  !env.GOOGLE_API_KEY.startsWith('dev_');

export interface VoiceSessionContext {
  caseId?: string;
  orderId?: string;
  customerName: string;
  productName: string;
  amountInRs: number;
  failureMode: string;
  maxDiscountPct: number;
  personaPrompt?: string;
  voiceType?: string;
  languageMode?: string;
}

export interface VoiceGreetingResult {
  script: string;
  discountPct: number;
  discountedPrice: number;
}

export interface VoiceTurnResult {
  aiReply: string;
  isPromise: boolean;
  hoursAhead: number;
  discountAppliedPct?: number;
}

export async function generateVoiceGreeting(context: VoiceSessionContext): Promise<VoiceGreetingResult> {
  const initialDiscount = Math.min(10, context.maxDiscountPct || 10);
  const discountedPrice = Math.round(context.amountInRs * (1 - initialDiscount / 100));

  const fallbackScript = `Namaste ${context.customerName}! Main Demo.pay recovery desk se Aditi baat kar rahi hoon. Maine dekha aapka ₹${context.amountInRs.toLocaleString()} ka ${context.productName} order complete nahi ho paya. Humne aapke liye ek special ${initialDiscount}% discount activate kiya hai, jisse yeh sirf ₹${discountedPrice.toLocaleString()} ka padega. Kya aap abhi complete karna chahenge ya kal schedule karein?`;

  const fallbackResult: VoiceGreetingResult = {
    script: fallbackScript,
    discountPct: initialDiscount,
    discountedPrice,
  };

  if (!hasValidGeminiKey) {
    return fallbackResult;
  }

  return executeWithGeminiRateLimit(
    async () => {
      const agent = new LlmAgent({
        name: 'voice_recovery_greeter',
        model: 'gemini-3.5-flash-lite',
        instruction: `You are Aditi, a warm, professional customer recovery agent for Demo.pay.
Generate a single, natural opening sentence in Hinglish (blend of conversational Hindi and English).
Acknowledge the interrupted checkout for ${context.productName} (₹${context.amountInRs.toLocaleString()}).
Mention that a special ${initialDiscount}% discount is activated (discounted price: ₹${discountedPrice.toLocaleString()}).
Ask politely whether they would like to finish now or schedule for later.
Keep it under 35 words. Return only the spoken script, without quotes or explanations.`,
      });

      const runner = new InMemoryRunner({ agent });
      let script = '';

      for await (const event of runner.runEphemeral({
        userId: 'customer',
        newMessage: {
          role: 'user',
          parts: [{ text: `Generate greeting for ${context.customerName}, product: ${context.productName}` }],
        },
      })) {
        const parts = event.content?.parts;
        if (Array.isArray(parts)) {
          for (const p of parts) {
            if (p.text) script += p.text;
          }
        }
      }

      const trimmed = script.trim();
      if (trimmed) {
        return {
          script: trimmed,
          discountPct: initialDiscount,
          discountedPrice,
        };
      }
      return fallbackResult;
    },
    fallbackResult,
    500
  );
}

export async function handleVoiceTurnWithAdk(params: {
  context: VoiceSessionContext;
  userSpeech: string;
  history: Array<{ sender: string; text: string }>;
}): Promise<VoiceTurnResult> {
  const { context, userSpeech, history } = params;
  const lower = userSpeech.toLowerCase().trim();

  let isPromiseDetected = false;
  let detectedHoursAhead = 24;

  if (
    lower.includes('kal') ||
    lower.includes('tomorrow') ||
    lower.includes('baad mein') ||
    lower.includes('later') ||
    lower.includes('shaam') ||
    lower.includes('evening') ||
    lower.includes('next week') ||
    lower.includes('monday') ||
    lower.includes('remind')
  ) {
    isPromiseDetected = true;
    if (lower.includes('monday') || lower.includes('next week')) {
      detectedHoursAhead = 48;
    } else if (lower.includes('shaam') || lower.includes('evening') || lower.includes('today')) {
      detectedHoursAhead = 6;
    } else {
      detectedHoursAhead = 24;
    }
  }

  const fallbackTurnResult = (): VoiceTurnResult => {
    if (isPromiseDetected) {
      const timeLabel = detectedHoursAhead === 24 ? 'kal' : detectedHoursAhead === 48 ? 'Monday tak' : 'aaj shaam tak';
      return {
        aiReply: `Bahut badhiya! Maine aapka order aur 10% discount ${timeLabel} ke liye lock kar diya hai. Direct payment link aapko WhatsApp par bhej diya gaya hai. Thank you so much!`,
        isPromise: true,
        hoursAhead: detectedHoursAhead,
        discountAppliedPct: 10,
      };
    }

    if (lower.includes('discount') || lower.includes('price') || lower.includes('mehenga') || lower.includes('kam')) {
      return {
        aiReply: `Main aapki baat samajh sakti hoon. Isiliye humne turant 10% instant discount apply kar diya hai! Kya main payment link abhi bhej doon?`,
        isPromise: false,
        hoursAhead: 0,
        discountAppliedPct: 10,
      };
    }

    if (lower.includes('fail') || lower.includes('error') || lower.includes('kyu') || lower.includes('why')) {
      return {
        aiReply: `Aapke bank server ke timeout ki wajah se payment pause ho gayi thi. Aapka amount safe hai. Humne direct 1-click UPI channel ready kar diya hai. Kya main link send kar doon?`,
        isPromise: false,
        hoursAhead: 0,
      };
    }

    if (lower.includes('cancel') || lower.includes('nahi') || lower.includes('no')) {
      return {
        aiReply: `Koi baat nahi, main samajh sakti hoon. Maine yeh cart aapke liye save kar di hai. Have a wonderful day!`,
        isPromise: false,
        hoursAhead: 0,
      };
    }

    return {
      aiReply: `Ji bilkul! Maine updated discount ke saath payment link aapke phone par send kar diya hai. Aap wahan se aasaani se complete kar sakte hain.`,
      isPromise: false,
      hoursAhead: 0,
    };
  };

  if (!hasValidGeminiKey) {
    return fallbackTurnResult();
  }

  return executeWithGeminiRateLimit(
    async () => {
      const recordPromiseTool = new FunctionTool({
        name: 'record_promise_to_pay',
        description: 'Record when a customer agrees to pay later or asks for a reminder at a specific time.',
        parameters: z.object({
          hoursAhead: z.number().describe('Number of hours to delay the reminder, e.g. 6, 24, 48'),
          timeframeDescription: z.string().describe('Readable timeframe, e.g. tomorrow, evening, monday'),
        }),
        execute: async (args) => {
          isPromiseDetected = true;
          detectedHoursAhead = args.hoursAhead || 24;
          return { status: 'recorded', hoursAhead: detectedHoursAhead };
        },
      });

      const conversationTranscript = history
        .slice(-6)
        .map((m) => `${m.sender === 'user' ? 'Customer' : 'Agent'}: ${m.text}`)
        .join('\n');

      const agent = new LlmAgent({
        name: 'voice_recovery_agent',
        model: 'gemini-3.5-flash-lite',
        instruction: `You are Aditi, an empathetic AI recovery assistant for Demo.pay speaking in natural Hinglish.
Order Details:
- Customer: ${context.customerName}
- Product: ${context.productName}
- Amount: ₹${context.amountInRs.toLocaleString()}
- Failure reason: ${context.failureMode}
- Max discount allowed: ${context.maxDiscountPct}%
${context.personaPrompt ? `- Merchant instructions: ${context.personaPrompt}` : ''}

Your goals:
1. Address the customer's comment empathetically.
2. If they mention paying tomorrow, later, in evening, or next week, call the record_promise_to_pay tool and confirm politely that their order and discount are reserved for that time.
3. If they hesitate or ask for a discount, offer up to ${Math.min(15, context.maxDiscountPct)}% discount.
4. If they ask why it failed, reassure them that their money is safe and the bank network timed out.
5. Keep your response concise (1-2 sentences max, conversational Hinglish), friendly, and direct.`,
        tools: [recordPromiseTool],
      });

      const runner = new InMemoryRunner({ agent });
      let reply = '';

      const promptMessage = `Recent conversation:
${conversationTranscript}
Customer just said: "${userSpeech}"
Respond appropriately in 1-2 spoken sentences.`;

      for await (const event of runner.runEphemeral({
        userId: 'customer',
        newMessage: {
          role: 'user',
          parts: [{ text: promptMessage }],
        },
      })) {
        const parts = event.content?.parts;
        if (Array.isArray(parts)) {
          for (const p of parts) {
            if (p.text) reply += p.text;
          }
        }
      }

      const trimmed = reply.trim();
      if (trimmed) {
        return {
          aiReply: trimmed,
          isPromise: isPromiseDetected,
          hoursAhead: detectedHoursAhead,
          discountAppliedPct: isPromiseDetected ? 10 : undefined,
        };
      }
      return fallbackTurnResult();
    },
    fallbackTurnResult,
    800
  );
}
