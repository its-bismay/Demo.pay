import { LlmAgent, InMemoryRunner, FunctionTool } from '@google/adk';
import { z } from 'zod';
import { env } from '../env';
import { executeWithGeminiRateLimit } from '../services/geminiRateLimiter';
import { getAgentPersonaInfo } from '../services/ttsService';

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
  currentDiscountPct?: number;
  personaPrompt?: string;
  voiceType?: string;
  languageMode?: string;
}

export interface VoiceGreetingResult {
  script: string;
  discountPct: number;
  discountedPrice: number;
  agentName: string;
  agentGender: 'female' | 'male';
}

export interface VoiceTurnResult {
  aiReply: string;
  isPromise: boolean;
  hoursAhead: number;
  discountAppliedPct?: number;
  agentName: string;
}

export async function generateVoiceGreeting(context: VoiceSessionContext): Promise<VoiceGreetingResult> {
  const persona = getAgentPersonaInfo(context.voiceType);
  const initialDiscount = context.currentDiscountPct || 0;
  const discountedPrice = Math.round(context.amountInRs * (1 - initialDiscount / 100));

  const fallbackScript = `Namaste ${context.customerName}! Main Demo.pay recovery desk se ${persona.agentName} ${persona.hindiPronouns.speaking}. Maine dekha aapka ₹${context.amountInRs.toLocaleString()} ka ${context.productName} order complete nahi ho paya tha. Kya payment mein koi takleef aayi thi? Main ${persona.hindiPronouns.assist}.`;

  const fallbackResult: VoiceGreetingResult = {
    script: fallbackScript,
    discountPct: initialDiscount,
    discountedPrice,
    agentName: persona.agentName,
    agentGender: persona.agentGender,
  };

  if (!hasValidGeminiKey) {
    return fallbackResult;
  }

  return executeWithGeminiRateLimit(
    async () => {
      const agent = new LlmAgent({
        name: 'voice_recovery_greeter',
        model: 'gemini-3.5-flash-lite',
        instruction: `You are ${persona.agentName}, a warm, professional customer recovery agent for Demo.pay speaking in natural Hinglish.
Your gender is ${persona.agentGender}. Use ${persona.hindiPronouns.speaking} and ${persona.hindiPronouns.assist}.
Generate a single, natural opening greeting in Hinglish.
Acknowledge that their order for ${context.productName} (₹${context.amountInRs.toLocaleString()}) was interrupted at checkout.
Ask politely if they faced any issue during payment and offer help.
Do not offer a discount right now; keep it focused on understanding what went wrong.
Keep it under 35 words. Return only the spoken script, without quotes or extra text.`,
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
          agentName: persona.agentName,
          agentGender: persona.agentGender,
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
  const persona = getAgentPersonaInfo(context.voiceType);

  const maxDiscount = context.maxDiscountPct || 15;
  const currentDiscount = context.currentDiscountPct || 0;

  let nextDiscount = currentDiscount;
  const mentionsPriceOrDiscount =
    lower.includes('discount') ||
    lower.includes('price') ||
    lower.includes('mehenga') ||
    lower.includes('expensive') ||
    lower.includes('kam') ||
    lower.includes('budget') ||
    lower.includes('cost') ||
    lower.includes('jyada') ||
    lower.includes('nahi lena');

  if (mentionsPriceOrDiscount) {
    if (currentDiscount === 0) {
      nextDiscount = Math.min(5, maxDiscount);
    } else if (currentDiscount < 10) {
      nextDiscount = Math.min(10, maxDiscount);
    } else if (currentDiscount < maxDiscount) {
      nextDiscount = maxDiscount;
    }
  }

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
      const discNote = nextDiscount > 0 ? ` aur ${nextDiscount}% discount` : '';
      return {
        aiReply: `Bahut badhiya! Maine aapka order${discNote} ${timeLabel} ke liye reserve kar diya hai. Link WhatsApp par bhej diya hai. Thank you so much!`,
        isPromise: true,
        hoursAhead: detectedHoursAhead,
        discountAppliedPct: nextDiscount > 0 ? nextDiscount : undefined,
        agentName: persona.agentName,
      };
    }

    if (mentionsPriceOrDiscount) {
      if (nextDiscount > currentDiscount) {
        return {
          aiReply: `Main samajh sakta hoon. Aapke liye maine special ${nextDiscount}% discount apply kiya hai. Kya main direct payment link bhej doon?`,
          isPromise: false,
          hoursAhead: 0,
          discountAppliedPct: nextDiscount,
          agentName: persona.agentName,
        };
      }
      return {
        aiReply: `Maine pehle hi aapke liye maximum ${maxDiscount}% discount lock kiya hai. Isse kam possible nahi ho payega. Kya main link share kar doon?`,
        isPromise: false,
        hoursAhead: 0,
        discountAppliedPct: maxDiscount,
        agentName: persona.agentName,
      };
    }

    if (lower.includes('fail') || lower.includes('error') || lower.includes('kyu') || lower.includes('why')) {
      return {
        aiReply: `Aapke bank server ke temporary timeout ki wajah se payment pause hui thi. Aapka amount safe hai. Humne 1-click UPI checkout ready kiya hai, kya link send kar doon?`,
        isPromise: false,
        hoursAhead: 0,
        discountAppliedPct: currentDiscount > 0 ? currentDiscount : undefined,
        agentName: persona.agentName,
      };
    }

    if (lower.includes('cancel') || lower.includes('nahi') || lower.includes('no')) {
      if (currentDiscount < maxDiscount) {
        const stepped = Math.min(currentDiscount + 5, maxDiscount);
        return {
          aiReply: `Ek minute rukiye! Agar aap abhi complete karte hain toh main turant ${stepped}% extra discount de ${persona.hindiPronouns.canDo}. Kya yeh chalega?`,
          isPromise: false,
          hoursAhead: 0,
          discountAppliedPct: stepped,
          agentName: persona.agentName,
        };
      }
      return {
        aiReply: `Koi baat nahi, main samajh ${persona.agentGender === 'male' ? 'sakta' : 'sakti'} hoon. Maine aapka cart save kar diya hai. Aapka din shubh ho!`,
        isPromise: false,
        hoursAhead: 0,
        discountAppliedPct: currentDiscount > 0 ? currentDiscount : undefined,
        agentName: persona.agentName,
      };
    }

    return {
      aiReply: `Ji bilkul! Maine payment link ready kar diya hai. Aap wahan se aasaani se apna order complete ${persona.hindiPronouns.canDo}.`,
      isPromise: false,
      hoursAhead: 0,
      discountAppliedPct: currentDiscount > 0 ? currentDiscount : undefined,
      agentName: persona.agentName,
    };
  };

  if (!hasValidGeminiKey) {
    return fallbackTurnResult();
  }

  return executeWithGeminiRateLimit(
    async () => {
      let negotiatedDiscount = nextDiscount;

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

      const applyDiscountTool = new FunctionTool({
        name: 'apply_stepwise_discount',
        description: 'Apply an incremental discount when the customer hesitates or complains about price.',
        parameters: z.object({
          discountPct: z.number().describe(`The discount percentage to offer. Must not exceed ${maxDiscount}%.`),
          rationale: z.string().describe('Why this discount is being offered'),
        }),
        execute: async (args) => {
          negotiatedDiscount = Math.min(Math.max(args.discountPct, currentDiscount), maxDiscount);
          return { status: 'discount_approved', discountPct: negotiatedDiscount };
        },
      });

      const conversationTranscript = history
        .slice(-6)
        .map((m) => `${m.sender === 'user' ? 'Customer' : 'Agent'}: ${m.text}`)
        .join('\n');

      const agent = new LlmAgent({
        name: 'voice_recovery_agent',
        model: 'gemini-3.5-flash-lite',
        instruction: `You are ${persona.agentName}, an empathetic ${persona.agentGender} AI recovery assistant for Demo.pay speaking in natural Hinglish.
Grammar rule: use ${persona.agentGender === 'male' ? 'male phrasing (e.g. bol raha hoon, kar sakta hoon)' : 'female phrasing (e.g. bol rahi hoon, kar sakti hoon)'}.
Order Details:
- Customer: ${context.customerName}
- Product: ${context.productName}
- Original Amount: ₹${context.amountInRs.toLocaleString()}
- Failure reason: ${context.failureMode}
- Current discount offered: ${currentDiscount}%
- Maximum discount allowed: ${maxDiscount}%
${context.personaPrompt ? `- Merchant instructions: ${context.personaPrompt}` : ''}

Negotiation Guidelines:
1. Never jump straight to the maximum discount.
2. If customer complains about price or hesitates, use apply_stepwise_discount to offer an incremental discount (e.g. 5% first, then 10%, up to ${maxDiscount}% max).
3. If customer says they will pay later (tomorrow, evening, Monday), call record_promise_to_pay and confirm that their order and discount are reserved.
4. If customer asks why payment failed, explain that their bank server timed out and their money is completely safe.
5. Keep your answer strictly under 2 spoken sentences in friendly, natural conversational Hinglish.`,
        tools: [recordPromiseTool, applyDiscountTool],
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
          discountAppliedPct: negotiatedDiscount > 0 ? negotiatedDiscount : undefined,
          agentName: persona.agentName,
        };
      }
      return fallbackTurnResult();
    },
    fallbackTurnResult,
    800
  );
}
