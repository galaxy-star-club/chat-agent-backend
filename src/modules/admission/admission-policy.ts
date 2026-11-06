export const submissionsPerMinute = 10;
export const submissionWindowMs = 60_000;
export const initialCreditBalance = BigInt(100);
/** Free-model admission reserves no application credits. A positive price was not approved. */
export const freeAdmissionReservation = BigInt(0);

/** Reserve the free-model amount, or only the remaining balance when that balance is above zero. */
export function admissionReservation(available: bigint): bigint | null {
  const requested = freeAdmissionReservation;
  if (available >= requested) return requested;
  if (available > BigInt(0)) return available;
  return null;
}
