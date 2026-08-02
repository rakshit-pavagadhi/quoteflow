import { useQuery, useMutation } from '@apollo/client';
import { GET_QUOTE_HISTORY, TRANSITION_QUOTE } from '../api/queries';

type Props = {
  quoteId: string;
  onClose: () => void;
  showToast: (message: string, type: 'success' | 'error') => void;
};

export default function QuoteHistoryModal({ quoteId, onClose, showToast }: Props) {
  const { loading, data } = useQuery(GET_QUOTE_HISTORY, {
    variables: { quoteId },
    fetchPolicy: 'network-only',
  });
  const [transition] = useMutation(TRANSITION_QUOTE);

  const history = data?.quoteHistory || [];
  const currentState = history.length > 0 ? history[history.length - 1].to_status : null;

  const handleTransition = async (toStatus: string, label: string) => {
    try {
      await transition({ variables: { id: quoteId, toStatus, actor: 'Current User' } });
      showToast(`Quote ${label} successfully`, 'success');
      onClose();
    } catch (e: any) {
      const msg = e.message?.includes('InvalidTransitionError')
        ? 'Invalid state transition'
        : 'Operation failed';
      showToast(msg, 'error');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Audit Trail</h2>
          <button onClick={onClose}>Close</button>
        </div>

        <div className="modal-body">
          {loading ? (
            <p style={{ color: 'var(--text-secondary)' }}>Loading history...</p>
          ) : (
            <div className="timeline">
              {history.map((t: any) => (
                <div key={t.id} className="timeline-item">
                  <div className="timeline-dot"></div>
                  <div>
                    <div>
                      <strong>{t.actor}</strong> → <strong>{t.to_status}</strong>
                    </div>
                    <div className="timeline-date">
                      {new Date(Number(t.transitioned_at)).toLocaleString()}
                    </div>
                    {t.note && (
                      <div style={{ color: 'var(--text-secondary)', marginTop: '0.25rem', fontSize: '0.85rem' }}>
                        {t.note}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="action-buttons">
            {currentState === 'draft' && (
              <button className="primary" onClick={() => handleTransition('submitted', 'submitted')}>
                Submit Quote
              </button>
            )}
            {currentState === 'submitted' && (
              <button className="primary" onClick={() => handleTransition('under_review', 'moved to review')}>
                Begin Review
              </button>
            )}
            {currentState === 'under_review' && (
              <>
                <button className="btn-approve" onClick={() => handleTransition('approved', 'approved')}>
                  Approve
                </button>
                <button className="btn-reject" onClick={() => handleTransition('rejected', 'rejected')}>
                  Reject
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}