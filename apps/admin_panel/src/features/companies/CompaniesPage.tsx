import { Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { CompanyStatus } from '../../shared/api/types';
import { PageHeader } from '../../shared/components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/StateBlock';
import { StatusBadge } from '../../shared/components/StatusBadge';
import { useAsync } from '../../shared/hooks/useAsync';
import { appStrings, statusLabel } from '../../shared/i18n/appStrings';
import { companiesService } from './companies.service';

const statuses: Array<CompanyStatus | ''> = ['', 'pending_approval', 'approved', 'rejected', 'suspended', 'inactive'];

export function CompaniesPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<CompanyStatus | ''>('pending_approval');
  const [search, setSearch] = useState('');
  const companies = useAsync(() => companiesService.list({ page, limit: 20, status, search }), [page, status, search]);

  return (
    <>
      <PageHeader title={appStrings.companies.title} description={appStrings.companies.description} />
      <div className="toolbar">
        <label className="search-box">
          <Search size={17} />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={appStrings.companies.search} />
        </label>
        <select value={status} onChange={(event) => setStatus(event.target.value as CompanyStatus | '')}>
          {statuses.map((item) => (
            <option key={item || 'all'} value={item}>{item ? statusLabel(item) : appStrings.allStatuses}</option>
          ))}
        </select>
      </div>

      {companies.loading ? <LoadingState /> : null}
      {companies.error ? <ErrorState message={companies.error} onRetry={companies.reload} /> : null}
      {companies.data ? (
        <section className="panel">
          {companies.data.data.length === 0 ? <EmptyState message={appStrings.companies.empty} /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>{appStrings.companies.name}</th><th>{appStrings.companies.contact}</th><th>{appStrings.companies.phone}</th><th>{appStrings.companies.status}</th><th /></tr></thead>
                <tbody>
                  {companies.data.data.map((company) => (
                    <tr key={company.id}>
                      <td>{company.name}</td>
                      <td>{company.contact_name || appStrings.notAvailable}</td>
                      <td>{company.phone}</td>
                      <td><StatusBadge status={company.status} /></td>
                      <td><Link className="link-btn" to={`/companies/${company.id}`}>{appStrings.view}</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="pagination">
            <button className="btn secondary compact" disabled={page <= 1} onClick={() => setPage(page - 1)}>{appStrings.previous}</button>
            <span>{appStrings.pageOf(page, companies.data.meta.total_pages)}</span>
            <button className="btn secondary compact" disabled={page >= companies.data.meta.total_pages} onClick={() => setPage(page + 1)}>{appStrings.next}</button>
          </div>
        </section>
      ) : null}
    </>
  );
}
