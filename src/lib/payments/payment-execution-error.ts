export const GENERIC_PAYMENT_FAILURE =
  "Payment could not be completed.\nNo funds were transferred.\nThe approval remains pending.";

export class PaymentExecutionError extends Error {
  constructor(public readonly safeMessage = GENERIC_PAYMENT_FAILURE) {
    super(safeMessage);
    this.name = "PaymentExecutionError";
  }
}
