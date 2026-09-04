export type FailureMode =
  | 'GATEWAY_TIMEOUT'
  | 'INSUFFICIENT_FUNDS'
  | 'UPI_UNREACHABLE'
  | 'AUTH_FAILED'
  | 'CHECKOUT_ABANDONED'
  | 'MANDATE_DECLINED'
  | 'INVOICE_OVERDUE';

const errorCodeMap: Record<string, FailureMode> = {
  GATEWAY_TIMEOUT: 'GATEWAY_TIMEOUT',
  payment_timed_out: 'GATEWAY_TIMEOUT',
  INSUFFICIENT_FUNDS: 'INSUFFICIENT_FUNDS',
  insufficient_fund: 'INSUFFICIENT_FUNDS',
  UPI_UNREACHABLE: 'UPI_UNREACHABLE',
  upi_collect_request_expired: 'UPI_UNREACHABLE',
  BAD_REQUEST_ERROR: 'AUTH_FAILED',
  authentication_failed: 'AUTH_FAILED',
  mandate_declined: 'MANDATE_DECLINED',
  MANDATE_DECLINED: 'MANDATE_DECLINED',
  invoice_overdue: 'INVOICE_OVERDUE',
  INVOICE_OVERDUE: 'INVOICE_OVERDUE',
};

export function classifyFailure(payload: any): FailureMode | null {
  if (payload?.event === 'cart.abandoned') return 'CHECKOUT_ABANDONED';
  const errorCode = payload?.payload?.payment?.entity?.error_code;
  const errorDesc = payload?.payload?.payment?.entity?.error_description;
  return errorCodeMap[errorCode] ?? errorCodeMap[errorDesc] ?? null;
}
