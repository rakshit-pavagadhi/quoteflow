import { useState, useCallback } from 'react';
import { useQuery } from '@apollo/client';
import { GET_QUOTES } from '../api/queries';
import QuoteCard from './QuoteCard';
import QuoteHistoryModal from './QuoteHistoryModal';

type Toast = { id: number; message: string; type: 'success' | 'error'; exit?: boolean };

const TOP_COLUMNS = [
  { id: 'draft', title: 'Draft', className: '' },
  { id: 'submitted', title: 'Submitted', className: '' },
  { id: 'under_review', title: 'Under Review', className: '' },
];

const BOTTOM_COLUMNS = [
  { id: 'approved', title: 'Approved', className: 'col-approved' },
  { id: 'rejected', title: 'Rejected', className: 'col-rejected' },
];

export default function KanbanBoard() {
  const { loading, error, data, refetch } = useQuery(GET_QUOTES, { fetchPolicy: 'network-only' });
  const [selectedQuote, setSelectedQuote] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    // Start exit animation after 4.5s, remove after 5s
    setTimeout(() => setToasts(prev => prev.map(t => t.id === id ? { ...t, exit: true } : t)), 4500);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }, []);

  if (loading) return <div className="board-container"><p style={{ color: 'var(--text-secondary)' }}>Loading pipeline...</p></div>;
  if (error) return <div className="board-container"><p style={{ color: '#fca5a5' }}>Ensure Backend is running (npm run dev in backend/)!</p></div>;

  const quotes = data?.quotes || [];
  const getQuotes = (colId: string) => quotes.filter((q: any) => q.status === colId);

  const renderColumn = (col: { id: string; title: string; className: string }) => {
    const colQuotes = getQuotes(col.id);
    return (
      <div key={col.id} className={`column ${col.className}`}>
        <div className="column-header">
          {col.title}
          <span className="quote-count">{colQuotes.length}</span>
        </div>
        <div className="column-content">
          {colQuotes.length === 0 ? (
            <div className="empty-state">No quotes</div>
          ) : (
            colQuotes.map((q: any) => (
              <QuoteCard key={q.id} quote={q} onClick={() => setSelectedQuote(q.id)} />
            ))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="board-container">
      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${t.type} ${t.exit ? 'exit' : ''}`}>
            <span className="toast-icon">{t.type === 'success' ? '✓' : '✕'}</span>
            {t.message}
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="board-header">
        <div className="logo-container">
          <div className="logo-icon">Q</div>
          <div className="logo-text">
            <h1>QuoteFlow</h1>
            <p>Logistics Quoting Pipeline</p>
          </div>
        </div>
      </div>

      {/* Top Row */}
      <div className="row-label">Pipeline</div>
      <div className="columns-row top-row">
        {TOP_COLUMNS.map(renderColumn)}
      </div>

      {/* Bottom Row */}
      <div className="row-label">Resolved</div>
      <div className="columns-row bottom-row">
        {BOTTOM_COLUMNS.map(renderColumn)}
      </div>

      {/* Modal */}
      {selectedQuote && (
        <QuoteHistoryModal
          quoteId={selectedQuote}
          onClose={() => { setSelectedQuote(null); refetch(); }}
          showToast={showToast}
        />
      )}
    </div>
  );
}