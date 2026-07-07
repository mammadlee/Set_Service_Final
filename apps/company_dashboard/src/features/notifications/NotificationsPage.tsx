import { CheckCheck } from 'lucide-react';
import { useState } from 'react';
import { getErrorMessage } from '../../shared/api/http';
import { PageHeader } from '../../shared/components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/StateBlock';
import { useAsync } from '../../shared/hooks/useAsync';
import { appStrings, notificationBody, notificationChannel, notificationTitle } from '../../shared/i18n/appStrings';
import { formatDateTime } from '../../shared/utils/format';
import { notificationsService } from './notifications.service';

export function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const notifications = useAsync(
    () => notificationsService.list({ page: 1, limit: 50, unread_only: unreadOnly }),
    [unreadOnly],
  );

  async function markRead(id: string) {
    setWorkingId(id);
    setActionError(null);
    try {
      const updated = await notificationsService.markRead(id);
      notifications.setData((current) => current ? {
        ...current,
        data: current.data.map((item) => item.id === id ? updated : item),
      } : current);
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setWorkingId(null);
    }
  }

  async function markAllRead() {
    setWorkingId('all');
    setActionError(null);
    try {
      await notificationsService.markAllRead();
      await notifications.reload();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setWorkingId(null);
    }
  }

  return (
    <>
      <PageHeader
        title={appStrings.notifications.title}
        description={appStrings.notifications.description}
        actions={(
          <button className="btn primary compact" type="button" onClick={() => void markAllRead()} disabled={workingId === 'all'}>
            <CheckCheck size={16} />
            {appStrings.notifications.markAllRead}
          </button>
        )}
      />

      <div className="toolbar">
        <label className="switch-row">
          <input type="checkbox" checked={unreadOnly} onChange={(event) => setUnreadOnly(event.target.checked)} />
          <span>{appStrings.notifications.unreadOnly}</span>
        </label>
      </div>
      {actionError ? <div className="form-error">{actionError}</div> : null}

      {notifications.loading ? <LoadingState /> : null}
      {notifications.error ? <ErrorState message={notifications.error} onRetry={notifications.reload} /> : null}
      {notifications.data ? (
        <section className="notification-list">
          {notifications.data.data.length === 0 ? <EmptyState message={appStrings.notifications.empty} /> : null}
          {notifications.data.data.map((item) => (
            <article key={item.id} className={`notification-card ${item.read_at ? '' : 'unread'}`}>
              <div>
                <div className="notification-title">
                  <strong>{notificationTitle(item.type, item.title)}</strong>
                  <span>{item.read_at ? appStrings.notifications.read : appStrings.notifications.unread}</span>
                </div>
                <p>{notificationBody(item.type, item.body)}</p>
                <small>{formatDateTime(item.created_at)} · {notificationChannel(item.channel)}</small>
              </div>
              {!item.read_at ? (
                <button
                  className="btn secondary compact"
                  type="button"
                  disabled={workingId === item.id}
                  onClick={() => void markRead(item.id)}
                >
                  {appStrings.notifications.markRead}
                </button>
              ) : <span className="read-label">{appStrings.notifications.read}</span>}
            </article>
          ))}
        </section>
      ) : null}
    </>
  );
}
