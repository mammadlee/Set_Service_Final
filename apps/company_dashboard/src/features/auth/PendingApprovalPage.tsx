import { Clock } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { accountState, appStrings, statusLabel } from '../../shared/i18n/appStrings';

export function PendingApprovalPage() {
  const location = useLocation();
  const status = typeof location.state === 'object' && location.state && 'status' in location.state
    ? String(location.state.status)
    : 'pending_approval';
  const state = accountState(status);

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-heading">
          <Clock size={32} />
          <div>
            <h1>{state.title}</h1>
            <p>{state.body}</p>
          </div>
        </div>
        <div className="approval-notice">
          <strong>{appStrings.accountState.currentStatus}</strong>
          <span>{statusLabel(status)}</span>
        </div>
        <Link className="btn primary full" to="/login">{appStrings.accountState.backToLogin}</Link>
      </section>
    </main>
  );
}
