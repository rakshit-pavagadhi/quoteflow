export type QuoteStatus = 
  | 'draft' 
  | 'submitted' 
  | 'under_review' 
  | 'approved' 
  | 'rejected' 
  | 'expired';

// Map of valid transitions: from_status -> array of allowed to_status
const VALID_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ['submitted'],
  submitted: ['under_review', 'expired'],
  under_review: ['approved', 'rejected', 'expired'],
  approved: [], // terminal
  rejected: [], // terminal
  expired: [],  // terminal
};

export class InvalidTransitionError extends Error {
  constructor(from: QuoteStatus | null, to: QuoteStatus) {
    super(`InvalidTransitionError: cannot move quote from '${from}' to '${to}'`);
    this.name = 'InvalidTransitionError';
  }
}

/**
 * Validates whether a state transition is allowed according to the business rules.
 * Throws InvalidTransitionError if the transition is illegal.
 */
export function validateTransition(fromStatus: QuoteStatus | null, toStatus: QuoteStatus): void {
  // Quote creation is treated as a null -> draft transition
  if (fromStatus === null) {
    if (toStatus !== 'draft') {
      throw new InvalidTransitionError(fromStatus, toStatus);
    }
    return;
  }

  const allowedNextStates = VALID_TRANSITIONS[fromStatus];
  
  if (!allowedNextStates || !allowedNextStates.includes(toStatus)) {
    throw new InvalidTransitionError(fromStatus, toStatus);
  }
}