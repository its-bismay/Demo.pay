import { LlmAgent, InMemoryRunner } from '@google/adk';
import { env } from '../env';
import { executeWithGeminiRateLimit } from '../services/geminiRateLimiter';

const hasValidGeminiKey =
  Boolean(env.GOOGLE_API_KEY) &&
  !env.GOOGLE_API_KEY.startsWith('dev_');

export interface ScenarioContext {
  failureMode: string;
  amountInPaise: number;
  customerName: string;
  hasPhone: boolean;
  historyCount: number;
  currentDayOfMonth: number;
  policy: {
    maxDiscountPct?: number;
    minOrderValuePaise?: number;
    quietHoursStart?: string;
    quietHoursEnd?: string;
  };
}

export interface DecisionResult {
  rootCause: string;
  confidence: number;
  recommendedChannels: Array<'VOICE' | 'WHATSAPP' | 'EMAIL'>;
  recommendedDiscountPct: number;
  reasoning: string;
  scheduleDelayMinutes: number;
}

export async function runInterventionDecisionAgent(
  context: ScenarioContext
): Promise<DecisionResult> {
  const {
    failureMode,
    amountInPaise,
    customerName,
    hasPhone,
    historyCount,
    currentDayOfMonth,
    policy,
  } = context;

  const maxAllowedDiscount = policy?.maxDiscountPct ?? 15;
  const minOrderValue = policy?.minOrderValuePaise ?? 200000;
  const isHighValue = amountInPaise >= minOrderValue;
  const isMonthEnd = currentDayOfMonth >= 26;

  const fallbackDecision = (): DecisionResult => {
    const channels: Array<'VOICE' | 'WHATSAPP' | 'EMAIL'> = ['EMAIL'];
    let discount = 0;
    let delay = 0;
    let reasoning = '';
    let rootCause = failureMode;

    if (failureMode === 'INSUFFICIENT_FUNDS') {
      rootCause = 'Customer experienced insufficient account balance during UPI authorization.';
      if (isMonthEnd) {
        if (hasPhone) channels.push('WHATSAPP');
        discount = Math.min(10, maxAllowedDiscount);
        delay = 60;
        reasoning = `Detected month-end insufficient funds on day ${currentDayOfMonth}. Suppressing disruptive phone call; scheduling respectful WhatsApp reservation nudge.`;
      } else {
        if (hasPhone) channels.push('WHATSAPP');
        if (isHighValue && hasPhone) channels.push('VOICE');
        discount = Math.min(10, maxAllowedDiscount);
        reasoning = `Identified mid-month balance shortage on ₹${amountInPaise / 100}. Engaging customer via ${channels.join(' & ')} with ${discount}% incentive.`;
      }
    } else if (failureMode === 'GATEWAY_TIMEOUT' || failureMode === 'UPI_UNREACHABLE') {
      rootCause = 'Bank NPCI gateway timeout or UPI server unreachable during checkout.';
      if (hasPhone) channels.push('WHATSAPP');
      if (isHighValue && hasPhone) channels.push('VOICE');
      discount = 0;
      reasoning = `Technical bank network failure identified. Immediate recovery link dispatched via ${channels.join(' & ')} to prevent cart abandonment.`;
    } else if (failureMode === 'CHECKOUT_ABANDONED') {
      rootCause = 'Customer abandoned checkout drawer prior to final payment authorization.';
      if (hasPhone) channels.push('WHATSAPP');
      discount = Math.min(5, maxAllowedDiscount);
      reasoning = `Cart abandonment detected on ₹${amountInPaise / 100}. Dispatched gentle recovery reminder with ${discount}% discount.`;
    } else {
      rootCause = `Payment unsuccessful due to ${failureMode}.`;
      if (hasPhone) channels.push('WHATSAPP');
      discount = 0;
      reasoning = `Automated recovery strategy for ${failureMode}. Routing via ${channels.join(' & ')}.`;
    }

    return {
      rootCause,
      confidence: 0.9,
      recommendedChannels: channels,
      recommendedDiscountPct: discount,
      reasoning,
      scheduleDelayMinutes: delay,
    };
  };

  if (!hasValidGeminiKey) {
    return fallbackDecision();
  }

  return executeWithGeminiRateLimit(
    async () => {
      const agent = new LlmAgent({
        name: 'revenue_recovery_decision_agent',
        model: 'gemini-3.5-flash-lite',
        instruction: `You are an autonomous AI Revenue Recovery Strategist for an e-commerce platform.
Evaluate checkout failures in real-time and decide the optimal recovery channel combination, discount incentive, and timing.

Rules:
1. If the customer does not have a phone number (hasPhone=false), NEVER recommend VOICE or WHATSAPP. Only EMAIL is viable.
2. If failureMode is INSUFFICIENT_FUNDS:
   - If it is month-end (day 26-31), do NOT call immediately because users often wait for monthly salary. Recommend a delayed WHATSAPP / EMAIL message offering cart reservation until salary credit, with a moderate discount.
   - If mid-month, recommend WHATSAPP with a small discount.
3. If failureMode is GATEWAY_TIMEOUT or UPI_UNREACHABLE:
   - This is technical bank latency. Do not give high discounts (0-5%). Act fast: recommend WHATSAPP / EMAIL with immediate 1-tap retry link. If high value, VOICE can be used to reassure the user.
4. If failureMode is CHECKOUT_ABANDONED:
   - Recommend EMAIL and gentle WHATSAPP reminder with a small discount (5-10%).
5. Maximum discount allowed by merchant is ${maxAllowedDiscount}%. Never exceed this.

Respond in strict JSON with no markdown backticks or commentary:
{
  "rootCause": string,
  "confidence": number between 0 and 1,
  "recommendedChannels": array of "VOICE" | "WHATSAPP" | "EMAIL",
  "recommendedDiscountPct": integer,
  "reasoning": string,
  "scheduleDelayMinutes": integer
}`,
      });

      const runner = new InMemoryRunner({ agent });
      let agentOutput = '';

      const prompt = `Evaluate scenario:
Customer: ${customerName}
Has Phone: ${hasPhone}
Failure Mode: ${failureMode}
Amount: ₹${(amountInPaise / 100).toFixed(2)}
Is High Value: ${isHighValue}
Day of Month: ${currentDayOfMonth} (Month-End: ${isMonthEnd})
Previous Failures: ${historyCount}
Max Discount Policy: ${maxAllowedDiscount}%`;

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
        const filteredChannels: Array<'VOICE' | 'WHATSAPP' | 'EMAIL'> = (
          parsed.recommendedChannels ?? ['EMAIL']
        ).filter((ch: string) => {
          if (!hasPhone && (ch === 'VOICE' || ch === 'WHATSAPP')) return false;
          return ['VOICE', 'WHATSAPP', 'EMAIL'].includes(ch);
        });

        if (filteredChannels.length === 0) {
          filteredChannels.push('EMAIL');
        }

        return {
          rootCause: parsed.rootCause || failureMode,
          confidence: Number(parsed.confidence) || 0.92,
          recommendedChannels: filteredChannels,
          recommendedDiscountPct: Math.min(
            Number(parsed.recommendedDiscountPct) || 0,
            maxAllowedDiscount
          ),
          reasoning: parsed.reasoning || `ADK agent diagnosed ${failureMode}`,
          scheduleDelayMinutes: Number(parsed.scheduleDelayMinutes) || 0,
        };
      }

      return fallbackDecision();
    },
    fallbackDecision,
    700
  );
}
