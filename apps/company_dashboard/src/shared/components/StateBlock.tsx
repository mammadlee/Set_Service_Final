import { AlertCircle, Inbox, Loader2 } from 'lucide-react';
import { appStrings } from '../i18n/appStrings';

export function LoadingState({ label = appStrings.loading, compact = false }: { label?: string; compact?: boolean }) {
  return (
    <div className={`state-block ${compact ? 'compact' : ''}`}>
      <Loader2 className="spin" size={24} />
      <span>{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="state-block error-state">
      <AlertCircle size={24} />
      <span>{message}</span>
          {onRetry ? (
        <button className="btn secondary" type="button" onClick={onRetry}>
          {appStrings.retry}
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ message = appStrings.empty }: { message?: string }) {
  return (
    <div className="state-block">
      <Inbox size={24} />
      <span>{message}</span>
    </div>
  );
}
