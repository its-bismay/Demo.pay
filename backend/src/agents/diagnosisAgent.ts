import { FailureMode } from '../services/ruleEngine';
import { runInterventionDecisionAgent } from './interventionDecisionAgent';

export interface DiagnosisResult {
  rootCause: string;
  confidence: number;
  recommendedChannels: Array<'VOICE' | 'WHATSAPP' | 'EMAIL'>;
  recommendedDiscountPct: number;
  reasoning: string;
  scheduleDelayMinutes?: number;
}

export async function runDiagnosisAgent(params: {
  failureMode: FailureMode;
  amountInPaise: number;
  customerName: string;
  historyCount: number;
  policy: any;
  hasPhone?: boolean;
}): Promise<DiagnosisResult> {
  const currentDayOfMonth = new Date().getDate();

  return runInterventionDecisionAgent({
    failureMode: params.failureMode,
    amountInPaise: params.amountInPaise,
    customerName: params.customerName,
    hasPhone: params.hasPhone ?? true,
    historyCount: params.historyCount,
    currentDayOfMonth,
    policy: {
      maxDiscountPct: params.policy?.maxDiscountPct,
      minOrderValuePaise: params.policy?.minOrderValuePaise,
      quietHoursStart: params.policy?.quietHoursStart,
      quietHoursEnd: params.policy?.quietHoursEnd,
    },
  });
}
