import { Building2, Edit3, Layers3, Plus, Search, ToggleLeft, ToggleRight, Workflow } from 'lucide-react';
import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { getErrorMessage } from '../../shared/api/http';
import type { TaxonomyDepartment, TaxonomyPosition, TaxonomyStatus, TaxonomySubdepartment } from '../../shared/api/types';
import { PageHeader } from '../../shared/components/PageHeader';
import { ErrorState, LoadingState } from '../../shared/components/StateBlock';
import { useAsync } from '../../shared/hooks/useAsync';
import { taxonomyService } from './taxonomy.service';

type TaxonomyTab = 'departments' | 'subdepartments' | 'positions';
type StatusFilter = 'all' | TaxonomyStatus;

type DepartmentForm = {
  id?: string;
  name_az: string;
  name_en: string;
  status: TaxonomyStatus;
};

type SubdepartmentForm = DepartmentForm & {
  department_id: string;
};

type PositionForm = DepartmentForm & {
  subdepartment_id: string;
};

type SubdepartmentRow = TaxonomySubdepartment & {
  department: Pick<TaxonomyDepartment, 'id' | 'name_az' | 'name_en' | 'status'>;
};

type PositionRow = TaxonomyPosition & {
  subdepartment: Pick<TaxonomySubdepartment, 'id' | 'name_az' | 'name_en' | 'status' | 'department_id'>;
  department: Pick<TaxonomyDepartment, 'id' | 'name_az' | 'name_en' | 'status'>;
};

const emptyDepartment: DepartmentForm = { name_az: '', name_en: '', status: 'active' };
const emptySubdepartment: SubdepartmentForm = { department_id: '', name_az: '', name_en: '', status: 'active' };
const emptyPosition: PositionForm = { subdepartment_id: '', name_az: '', name_en: '', status: 'active' };

const tabs: Array<{ key: TaxonomyTab; label: string; icon: typeof Building2 }> = [
  { key: 'departments', label: 'Şöbələr', icon: Building2 },
  { key: 'subdepartments', label: 'Departamentlər', icon: Workflow },
  { key: 'positions', label: 'Vəzifələr', icon: Layers3 },
];

export function TaxonomyPage() {
  const taxonomy = useAsync(() => taxonomyService.list(true), []);
  const [activeTab, setActiveTab] = useState<TaxonomyTab>('departments');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [departmentForm, setDepartmentForm] = useState<DepartmentForm>(emptyDepartment);
  const [subdepartmentForm, setSubdepartmentForm] = useState<SubdepartmentForm>(emptySubdepartment);
  const [positionForm, setPositionForm] = useState<PositionForm>(emptyPosition);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const departments = taxonomy.data?.data ?? [];

  const subdepartments = useMemo<SubdepartmentRow[]>(
    () =>
      departments.flatMap((department) =>
        department.subdepartments.map((subdepartment) => ({
          ...subdepartment,
          department: {
            id: department.id,
            name_az: department.name_az,
            name_en: department.name_en,
            status: department.status,
          },
        })),
      ),
    [departments],
  );

  const positions = useMemo<PositionRow[]>(
    () =>
      departments.flatMap((department) =>
        department.subdepartments.flatMap((subdepartment) =>
          subdepartment.positions.map((position) => ({
            ...position,
            subdepartment: {
              id: subdepartment.id,
              department_id: subdepartment.department_id,
              name_az: subdepartment.name_az,
              name_en: subdepartment.name_en,
              status: subdepartment.status,
            },
            department: {
              id: department.id,
              name_az: department.name_az,
              name_en: department.name_en,
              status: department.status,
            },
          })),
        ),
      ),
    [departments],
  );

  const filteredDepartments = departments.filter((department) =>
    matchesFilters([department.name_az, department.name_en], department.status, search, statusFilter),
  );
  const filteredSubdepartments = subdepartments.filter((subdepartment) =>
    matchesFilters(
      [subdepartment.name_az, subdepartment.name_en, subdepartment.department.name_az, subdepartment.department.name_en],
      subdepartment.status,
      search,
      statusFilter,
    ),
  );
  const filteredPositions = positions.filter((position) =>
    matchesFilters(
      [
        position.name_az,
        position.name_en,
        position.subdepartment.name_az,
        position.subdepartment.name_en,
        position.department.name_az,
        position.department.name_en,
      ],
      position.status,
      search,
      statusFilter,
    ),
  );

  async function save(action: () => Promise<void>) {
    setSaving(true);
    setError(null);
    try {
      await action();
      await taxonomy.reload();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setSaving(false);
    }
  }

  async function submitDepartment(event: FormEvent) {
    event.preventDefault();
    const payload = cleanForm(departmentForm);
    if (!payload.name_az) {
      setError('Azərbaycan dilində ad boş ola bilməz.');
      return;
    }
    await save(async () => {
      if (departmentForm.id) {
        await taxonomyService.updateDepartment(departmentForm.id, payload);
      } else {
        await taxonomyService.createDepartment(payload);
      }
      setDepartmentForm(emptyDepartment);
    });
  }

  async function submitSubdepartment(event: FormEvent) {
    event.preventDefault();
    const payload = cleanForm(subdepartmentForm);
    if (!payload.department_id || !payload.name_az) {
      setError('Şöbə və Azərbaycan dilində ad mütləq seçilməlidir.');
      return;
    }
    await save(async () => {
      if (subdepartmentForm.id) {
        await taxonomyService.updateSubdepartment(subdepartmentForm.id, payload);
      } else {
        await taxonomyService.createSubdepartment(payload);
      }
      setSubdepartmentForm(emptySubdepartment);
    });
  }

  async function submitPosition(event: FormEvent) {
    event.preventDefault();
    const payload = cleanForm(positionForm);
    if (!payload.subdepartment_id || !payload.name_az) {
      setError('Departament və Azərbaycan dilində ad mütləq seçilməlidir.');
      return;
    }
    await save(async () => {
      if (positionForm.id) {
        await taxonomyService.updatePosition(positionForm.id, payload);
      } else {
        await taxonomyService.createPosition(payload);
      }
      setPositionForm(emptyPosition);
    });
  }

  async function toggleDepartment(department: TaxonomyDepartment) {
    await save(() => taxonomyService.updateDepartment(department.id, { status: nextStatus(department.status) }).then(() => undefined));
  }

  async function toggleSubdepartment(subdepartment: TaxonomySubdepartment) {
    await save(() => taxonomyService.updateSubdepartment(subdepartment.id, { status: nextStatus(subdepartment.status) }).then(() => undefined));
  }

  async function togglePosition(position: TaxonomyPosition) {
    await save(() => taxonomyService.updatePosition(position.id, { status: nextStatus(position.status) }).then(() => undefined));
  }

  function switchTab(nextTab: TaxonomyTab) {
    setActiveTab(nextTab);
    setSearch('');
    setStatusFilter('all');
  }

  return (
    <>
      <PageHeader
        title="Vəzifə strukturu"
        description="Şöbə, departament və vəzifələrin idarə olunması"
      />

      <section className="panel taxonomy-command-panel">
        <div className="panel-heading">
          <div>
            <h2>Struktur idarəetməsi</h2>
            <p>Aktiv vəzifələr işçi profilində, müəssisə sifarişində və hesabat filtrlərində Azərbaycan dilindəki adı ilə görünür.</p>
          </div>
          <Layers3 size={20} />
        </div>
        <div className="taxonomy-tabs" role="tablist" aria-label="Vəzifə strukturu">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                className={activeTab === tab.key ? 'active' : ''}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => switchTab(tab.key)}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            );
          })}
        </div>
      </section>

      {error ? <div className="form-error taxonomy-error">{error}</div> : null}
      {taxonomy.loading ? <LoadingState /> : null}
      {taxonomy.error ? <ErrorState message={taxonomy.error} onRetry={taxonomy.reload} /> : null}

      {taxonomy.data ? (
        <section className="panel taxonomy-workspace">
          <TaxonomyFilters
            search={search}
            status={statusFilter}
            onSearch={setSearch}
            onStatus={setStatusFilter}
          />

          {activeTab === 'departments' ? (
            <DepartmentTab
              form={departmentForm}
              items={filteredDepartments}
              saving={saving}
              onFormChange={setDepartmentForm}
              onSubmit={submitDepartment}
              onCancel={() => setDepartmentForm(emptyDepartment)}
              onEdit={(department) => {
                setActiveTab('departments');
                setDepartmentForm({
                  id: department.id,
                  name_az: department.name_az,
                  name_en: department.name_en ?? '',
                  status: department.status,
                });
              }}
              onToggle={(department) => void toggleDepartment(department)}
            />
          ) : null}

          {activeTab === 'subdepartments' ? (
            <SubdepartmentTab
              departments={departments}
              form={subdepartmentForm}
              items={filteredSubdepartments}
              saving={saving}
              onFormChange={setSubdepartmentForm}
              onSubmit={submitSubdepartment}
              onCancel={() => setSubdepartmentForm(emptySubdepartment)}
              onEdit={(subdepartment) => {
                setActiveTab('subdepartments');
                setSubdepartmentForm({
                  id: subdepartment.id,
                  department_id: subdepartment.department_id,
                  name_az: subdepartment.name_az,
                  name_en: subdepartment.name_en ?? '',
                  status: subdepartment.status,
                });
              }}
              onToggle={(subdepartment) => void toggleSubdepartment(subdepartment)}
            />
          ) : null}

          {activeTab === 'positions' ? (
            <PositionTab
              subdepartments={subdepartments}
              form={positionForm}
              items={filteredPositions}
              saving={saving}
              onFormChange={setPositionForm}
              onSubmit={submitPosition}
              onCancel={() => setPositionForm(emptyPosition)}
              onEdit={(position) => {
                setActiveTab('positions');
                setPositionForm({
                  id: position.id,
                  subdepartment_id: position.subdepartment_id,
                  name_az: position.name_az,
                  name_en: position.name_en ?? '',
                  status: position.status,
                });
              }}
              onToggle={(position) => void togglePosition(position)}
            />
          ) : null}
        </section>
      ) : null}
    </>
  );
}

function TaxonomyFilters({
  search,
  status,
  onSearch,
  onStatus,
}: {
  search: string;
  status: StatusFilter;
  onSearch: (value: string) => void;
  onStatus: (value: StatusFilter) => void;
}) {
  return (
    <div className="toolbar compact-toolbar taxonomy-toolbar">
      <label className="search-box">
        <Search size={16} />
        <input value={search} placeholder="Axtar" onChange={(event) => onSearch(event.target.value)} />
      </label>
      <select value={status} onChange={(event) => onStatus(event.target.value as StatusFilter)}>
        <option value="all">Bütün statuslar</option>
        <option value="active">Aktiv</option>
        <option value="inactive">Deaktiv</option>
      </select>
    </div>
  );
}

function DepartmentTab({
  form,
  items,
  saving,
  onFormChange,
  onSubmit,
  onCancel,
  onEdit,
  onToggle,
}: {
  form: DepartmentForm;
  items: TaxonomyDepartment[];
  saving: boolean;
  onFormChange: (form: DepartmentForm) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
  onEdit: (department: TaxonomyDepartment) => void;
  onToggle: (department: TaxonomyDepartment) => void;
}) {
  return (
    <>
      <TaxonomyFormShell title={form.id ? 'Şöbəni redaktə et' : 'Yeni şöbə'} onSubmit={onSubmit}>
        <TextField label="Azərbaycan dilində adı" value={form.name_az} onChange={(name_az) => onFormChange({ ...form, name_az })} />
        <TextField label="İngilis dilində adı" value={form.name_en} onChange={(name_en) => onFormChange({ ...form, name_en })} />
        <StatusSelect value={form.status} onChange={(status) => onFormChange({ ...form, status })} />
        <FormActions editing={Boolean(form.id)} saving={saving} disabled={!form.name_az.trim()} onCancel={onCancel} />
      </TaxonomyFormShell>

      <TaxonomyTableTitle title="Şöbələr" count={items.length} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Azərbaycan dilində adı</th>
              <th>İngilis dilində adı</th>
              <th>Status</th>
              <th>Əməliyyatlar</th>
            </tr>
          </thead>
          <tbody>
            {items.map((department) => (
              <tr key={department.id}>
                <td><strong>{department.name_az}</strong></td>
                <td>{department.name_en || '-'}</td>
                <td><StatusBadge status={department.status} /></td>
                <td>
                  <RowActions
                    status={department.status}
                    disabled={saving}
                    onEdit={() => onEdit(department)}
                    onToggle={() => onToggle(department)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function SubdepartmentTab({
  departments,
  form,
  items,
  saving,
  onFormChange,
  onSubmit,
  onCancel,
  onEdit,
  onToggle,
}: {
  departments: TaxonomyDepartment[];
  form: SubdepartmentForm;
  items: SubdepartmentRow[];
  saving: boolean;
  onFormChange: (form: SubdepartmentForm) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
  onEdit: (subdepartment: TaxonomySubdepartment) => void;
  onToggle: (subdepartment: TaxonomySubdepartment) => void;
}) {
  return (
    <>
      <TaxonomyFormShell title={form.id ? 'Departamenti redaktə et' : 'Yeni departament'} onSubmit={onSubmit}>
        <label className="field">
          <span>Şöbə</span>
          <select value={form.department_id} onChange={(event) => onFormChange({ ...form, department_id: event.target.value })} required>
            <option value="">Şöbə seç</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>{department.name_az}</option>
            ))}
          </select>
        </label>
        <TextField label="Azərbaycan dilində adı" value={form.name_az} onChange={(name_az) => onFormChange({ ...form, name_az })} />
        <TextField label="İngilis dilində adı" value={form.name_en} onChange={(name_en) => onFormChange({ ...form, name_en })} />
        <StatusSelect value={form.status} onChange={(status) => onFormChange({ ...form, status })} />
        <FormActions editing={Boolean(form.id)} saving={saving} disabled={!form.department_id || !form.name_az.trim()} onCancel={onCancel} />
      </TaxonomyFormShell>

      <TaxonomyTableTitle title="Departamentlər" count={items.length} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Azərbaycan dilində adı</th>
              <th>İngilis dilində adı</th>
              <th>Şöbə</th>
              <th>Status</th>
              <th>Əməliyyatlar</th>
            </tr>
          </thead>
          <tbody>
            {items.map((subdepartment) => (
              <tr key={subdepartment.id}>
                <td><strong>{subdepartment.name_az}</strong></td>
                <td>{subdepartment.name_en || '-'}</td>
                <td>{subdepartment.department.name_az}</td>
                <td><StatusBadge status={subdepartment.status} /></td>
                <td>
                  <RowActions
                    status={subdepartment.status}
                    disabled={saving}
                    onEdit={() => onEdit(subdepartment)}
                    onToggle={() => onToggle(subdepartment)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function PositionTab({
  subdepartments,
  form,
  items,
  saving,
  onFormChange,
  onSubmit,
  onCancel,
  onEdit,
  onToggle,
}: {
  subdepartments: SubdepartmentRow[];
  form: PositionForm;
  items: PositionRow[];
  saving: boolean;
  onFormChange: (form: PositionForm) => void;
  onSubmit: (event: FormEvent) => void;
  onCancel: () => void;
  onEdit: (position: TaxonomyPosition) => void;
  onToggle: (position: TaxonomyPosition) => void;
}) {
  return (
    <>
      <TaxonomyFormShell title={form.id ? 'Vəzifəni redaktə et' : 'Yeni vəzifə'} onSubmit={onSubmit}>
        <label className="field">
          <span>Departament</span>
          <select value={form.subdepartment_id} onChange={(event) => onFormChange({ ...form, subdepartment_id: event.target.value })} required>
            <option value="">Departament seç</option>
            {subdepartments.map((subdepartment) => (
              <option key={subdepartment.id} value={subdepartment.id}>
                {subdepartment.department.name_az} / {subdepartment.name_az}
              </option>
            ))}
          </select>
        </label>
        <TextField label="Azərbaycan dilində adı" value={form.name_az} onChange={(name_az) => onFormChange({ ...form, name_az })} />
        <TextField label="İngilis dilində adı" value={form.name_en} onChange={(name_en) => onFormChange({ ...form, name_en })} />
        <StatusSelect value={form.status} onChange={(status) => onFormChange({ ...form, status })} />
        <FormActions editing={Boolean(form.id)} saving={saving} disabled={!form.subdepartment_id || !form.name_az.trim()} onCancel={onCancel} />
      </TaxonomyFormShell>

      <TaxonomyTableTitle title="Vəzifələr" count={items.length} />
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Azərbaycan dilində adı</th>
              <th>İngilis dilində adı</th>
              <th>Departament</th>
              <th>Status</th>
              <th>Əməliyyatlar</th>
            </tr>
          </thead>
          <tbody>
            {items.map((position) => (
              <tr key={position.id}>
                <td><strong>{position.name_az}</strong></td>
                <td>{position.name_en || '-'}</td>
                <td>
                  {position.department.name_az}
                  <span className="table-subtext">{position.subdepartment.name_az}</span>
                </td>
                <td><StatusBadge status={position.status} /></td>
                <td>
                  <RowActions
                    status={position.status}
                    disabled={saving}
                    onEdit={() => onEdit(position)}
                    onToggle={() => onToggle(position)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function TaxonomyFormShell({ title, children, onSubmit }: { title: string; children: ReactNode; onSubmit: (event: FormEvent) => void }) {
  return (
    <form className="taxonomy-editor" onSubmit={onSubmit}>
      <div className="taxonomy-editor-title">
        <Plus size={16} />
        <h3>{title}</h3>
      </div>
      <div className="taxonomy-form-grid">{children}</div>
    </form>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function StatusSelect({ value, onChange }: { value: TaxonomyStatus; onChange: (value: TaxonomyStatus) => void }) {
  return (
    <label className="field">
      <span>Status</span>
      <select value={value} onChange={(event) => onChange(event.target.value as TaxonomyStatus)}>
        <option value="active">Aktiv</option>
        <option value="inactive">Deaktiv</option>
      </select>
    </label>
  );
}

function FormActions({
  editing,
  saving,
  disabled,
  onCancel,
}: {
  editing: boolean;
  saving: boolean;
  disabled: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="taxonomy-form-actions">
      <button className="btn primary compact" type="submit" disabled={saving || disabled}>
        <Plus size={15} />
        {editing ? 'Yadda saxla' : 'Yarat'}
      </button>
      {editing ? (
        <button className="btn ghost compact" type="button" onClick={onCancel} disabled={saving}>
          Ləğv et
        </button>
      ) : null}
    </div>
  );
}

function TaxonomyTableTitle({ title, count }: { title: string; count: number }) {
  return (
    <div className="taxonomy-table-title">
      <h3>{title}</h3>
      <span>{count} nəticə</span>
    </div>
  );
}

function RowActions({
  status,
  disabled,
  onEdit,
  onToggle,
}: {
  status: TaxonomyStatus;
  disabled: boolean;
  onEdit: () => void;
  onToggle: () => void;
}) {
  const ToggleIcon = status === 'active' ? ToggleLeft : ToggleRight;
  return (
    <div className="table-actions">
      <button className="btn secondary compact" type="button" onClick={onEdit} disabled={disabled}>
        <Edit3 size={14} />
        Redaktə et
      </button>
      <button className="btn ghost compact" type="button" onClick={onToggle} disabled={disabled}>
        <ToggleIcon size={15} />
        {status === 'active' ? 'Deaktiv et' : 'Aktiv et'}
      </button>
    </div>
  );
}

function StatusBadge({ status }: { status: TaxonomyStatus }) {
  return <span className={`badge status-${status}`}>{status === 'active' ? 'Aktiv' : 'Deaktiv'}</span>;
}

function cleanForm<T extends { id?: string; name_az: string; name_en?: string }>(form: T) {
  const { id: _id, name_az, name_en, ...rest } = form;
  const trimmedNameEn = name_en?.trim();
  return {
    ...rest,
    name_az: name_az.trim(),
    ...(trimmedNameEn ? { name_en: trimmedNameEn } : {}),
  };
}

function nextStatus(status: TaxonomyStatus): TaxonomyStatus {
  return status === 'active' ? 'inactive' : 'active';
}

function matchesFilters(values: Array<string | null | undefined>, status: TaxonomyStatus, search: string, statusFilter: StatusFilter) {
  const needle = search.trim().toLocaleLowerCase('az');
  const statusMatches = statusFilter === 'all' || status === statusFilter;
  const searchMatches = !needle || values.some((value) => value?.toLocaleLowerCase('az').includes(needle));
  return statusMatches && searchMatches;
}
