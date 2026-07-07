import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { appStrings } from '../i18n/appStrings';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  tone?: 'primary' | 'danger';
  requireReason?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (reason?: string) => void;
}

export function ConfirmModal({
  open,
  title,
  message,
  confirmLabel,
  tone = 'primary',
  requireReason,
  loading,
  onCancel,
  onConfirm,
}: ConfirmModalProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    setReason('');
  }, [open]);

  if (!open) return null;

  const canConfirm = !requireReason || reason.trim().length >= 3;
  const confirmReason = requireReason ? reason.trim() : undefined;

  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div className="modal-header">
          <h2 id="confirm-title">{title}</h2>
          <button className="icon-btn" type="button" onClick={onCancel} aria-label={appStrings.close}>
            <X size={18} />
          </button>
        </div>
        <p>{message}</p>
        {requireReason ? (
          <label className="field">
            <span>{appStrings.requiredReason}</span>
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={appStrings.reasonPlaceholder}
              rows={4}
            />
          </label>
        ) : null}
        <div className="modal-actions">
          <button className="btn secondary" type="button" onClick={onCancel} disabled={loading}>
            {appStrings.cancel}
          </button>
          <button
            className={`btn ${tone === 'danger' ? 'danger' : 'primary'}`}
            type="button"
            onClick={() => onConfirm(confirmReason || undefined)}
            disabled={loading || !canConfirm}
          >
            {loading ? appStrings.working : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
