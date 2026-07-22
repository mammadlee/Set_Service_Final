import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getErrorMessage } from '../../shared/api/http';
import { useAuth } from '../../app/auth/AuthProvider';
import { hasPermission } from '../../shared/auth/permissions';
import { appStrings } from '../../shared/i18n/appStrings';
import { ConfirmModal } from '../../shared/components/ConfirmModal';
import { PageHeader } from '../../shared/components/PageHeader';
import { ErrorState, LoadingState } from '../../shared/components/StateBlock';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { useAsync } from '../../shared/hooks/useAsync';
import { resolveAssetUrl } from '../../shared/utils/documents';
import { companiesService } from './companies.service';

export function CompanyDetailPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const canManageCompanies = hasPermission(user, 'manage_companies');
  const company = useAsync(() => companiesService.get(id), [id]);
  const documents = company.data?.documents ?? [];
  const [action, setAction] = useState<'approve' | 'reject' | null>(null);
  const [working, setWorking] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [openingDocument, setOpeningDocument] = useState<string | null>(null);

  async function openDocument(type: string) {
    setOpeningDocument(type);
    setActionError(null);
    try {
      const capability = await companiesService.authorizeDocument(id, type);
      const url = resolveAssetUrl(capability.url);
      if (!url) throw new Error(appStrings.companies.noDocuments);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setOpeningDocument(null);
    }
  }

  async function confirm(reason?: string) {
    setWorking(true);
    setActionError(null);
    try {
      if (action === 'approve') await companiesService.approve(id);
      if (action === 'reject') await companiesService.reject(id, reason || '');
      setAction(null);
      await company.reload();
    } catch (error) {
      setActionError(getErrorMessage(error));
    } finally {
      setWorking(false);
    }
  }

  return (
    <>
      <PageHeader
        title={appStrings.companies.detailTitle}
        description={appStrings.companies.detailDescription}
        actions={<Link className="btn secondary compact" to="/companies"><ArrowLeft size={16} />{appStrings.back}</Link>}
      />

      {company.loading ? <LoadingState /> : null}
      {company.error ? <ErrorState message={company.error} onRetry={company.reload} /> : null}
      {company.data ? (
        <section className="detail-grid">
          <div className="panel">
            <div className="detail-title">
              <h2>{company.data.name}</h2>
              <StatusBadge status={company.data.status} />
            </div>
            <dl className="detail-list">
              <dt>{appStrings.companies.contact}</dt><dd>{company.data.contact_name || appStrings.notAvailable}</dd>
              <dt>{appStrings.companies.phone}</dt><dd>{company.data.phone}</dd>
              <dt>{appStrings.companies.email}</dt><dd>{company.data.email || appStrings.notAvailable}</dd>
              <dt>{appStrings.companies.rejectReason}</dt><dd>{company.data.reject_reason || appStrings.notAvailable}</dd>
            </dl>
            {canManageCompanies ? (
              <div className="action-row">
                <button className="btn primary" disabled={company.data.status === 'approved'} onClick={() => setAction('approve')}>{appStrings.companies.approve}</button>
                <button className="btn danger" disabled={company.data.status === 'rejected'} onClick={() => setAction('reject')}>{appStrings.companies.reject}</button>
              </div>
            ) : null}
            {actionError ? <div className="form-error">{actionError}</div> : null}
          </div>
          <div className="panel">
            <h2>{appStrings.companies.documents}</h2>
            {documents.length > 0 ? (
              <ul className="document-list">
                {documents.map((doc, index) => (
                  <li key={`${doc.type}-${index}`}>
                    <span>{doc.name || doc.type || appStrings.workers.document}</span>
                    {doc.available ? (
                      <button
                        className="btn secondary compact"
                        type="button"
                        disabled={openingDocument === doc.type}
                        onClick={() => void openDocument(doc.type)}
                      >
                        {appStrings.workers.openDocument}
                      </button>
                    ) : <span className="muted">{appStrings.notAvailable}</span>}
                  </li>
                ))}
              </ul>
            ) : <p className="muted">{appStrings.companies.noDocuments}</p>}
          </div>
        </section>
      ) : null}

      <ConfirmModal open={action === 'approve'} title={appStrings.companies.approveTitle} message={appStrings.companies.approveMessage} confirmLabel={appStrings.companies.approve} loading={working} onCancel={() => setAction(null)} onConfirm={() => void confirm()} />
      <ConfirmModal open={action === 'reject'} title={appStrings.companies.rejectTitle} message={appStrings.companies.rejectMessage} confirmLabel={appStrings.companies.reject} tone="danger" requireReason loading={working} onCancel={() => setAction(null)} onConfirm={(reason) => void confirm(reason)} />
    </>
  );
}
