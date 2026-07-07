import clsx from 'clsx';
import { statusLabel } from '../i18n/appStrings';

export function StatusBadge({ status }: { status: string }) {
  return <span className={clsx('badge', `status-${status}`)}>{statusLabel(status)}</span>;
}
