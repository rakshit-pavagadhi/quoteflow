import { validateTransition, InvalidTransitionError } from '../stateMachine';

describe('State Machine', () => {
  it('allows valid transition from null to draft (creation)', () => {
    expect(() => validateTransition(null, 'draft')).not.toThrow();
  });

  it('rejects invalid creation transition', () => {
    expect(() => validateTransition(null, 'approved')).toThrow(InvalidTransitionError);
  });

  it('allows valid transitions according to business rules', () => {
    expect(() => validateTransition('draft', 'submitted')).not.toThrow();
    expect(() => validateTransition('submitted', 'under_review')).not.toThrow();
    expect(() => validateTransition('under_review', 'approved')).not.toThrow();
    expect(() => validateTransition('under_review', 'rejected')).not.toThrow();
    expect(() => validateTransition('under_review', 'expired')).not.toThrow();
  });

  it('rejects invalid transitions', () => {
    expect(() => validateTransition('draft', 'approved')).toThrow(InvalidTransitionError);
    expect(() => validateTransition('submitted', 'draft')).toThrow(InvalidTransitionError);
    expect(() => validateTransition('approved', 'draft')).toThrow(InvalidTransitionError); // out of terminal
    expect(() => validateTransition('rejected', 'under_review')).toThrow(InvalidTransitionError);
  });
});