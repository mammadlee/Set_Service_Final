import { Plus, Save, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageHeader } from '../../shared/components/PageHeader';
import { EmptyState, ErrorState, LoadingState } from '../../shared/components/StateBlock';
import type { AdminPermission, ManagedAdmin } from '../../shared/api/types';
import {
  ADMIN_PERMISSIONS,
  expandPermissions,
  isRequiredBySelectedPermissions,
} from '../../shared/auth/permissions';
import { useAsync } from '../../shared/hooks/useAsync';
import { adminsService } from './admins.service';

const permissionLabels: Record<AdminPermission, string> = {
  view_dashboard: 'Dashboard baxışı',
  view_workers: 'İşçilərə baxış',
  manage_workers: 'İşçiləri idarə et',
  view_companies: 'Müəssisələrə baxış',
  manage_companies: 'Müəssisələri idarə et',
  view_orders: 'Sifarişlərə baxış',
  view_assignments: 'Təyinatlara baxış',
  manage_assignments: 'Təyinatları idarə et',
  view_attendance: 'Davamiyyətə baxış',
  view_reports: 'Hesabatlara baxış',
  manage_kiosks: 'QR kioskları idarə et',
  view_notifications: 'Bildirişlərə baxış',
  manage_admins: 'Adminləri idarə et',
};

const permissionGroups: Array<{ title: string; permissions: AdminPermission[] }> = [
  { title: 'İcmal', permissions: ['view_dashboard', 'view_reports', 'view_notifications'] },
  { title: 'İşçi və müəssisələr', permissions: ['view_workers', 'manage_workers', 'view_companies', 'manage_companies'] },
  { title: 'Sifariş əməliyyatları', permissions: ['view_orders', 'view_assignments', 'manage_assignments', 'view_attendance'] },
  { title: 'Sistem', permissions: ['manage_kiosks', 'manage_admins'] },
];

const emptyForm = {
  name: '',
  email: '',
  password: '',
  is_active: true,
  permissions: [] as AdminPermission[],
};

export function AdminsPage() {
  const admins = useAsync(() => adminsService.list(), []);
  const [selected, setSelected] = useState<ManagedAdmin | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editing = Boolean(selected);
  const expandedPermissions = useMemo(() => expandPermissions(form.permissions), [form.permissions]);
  const selectedIds = useMemo(() => new Set(expandedPermissions), [expandedPermissions]);
  const nameValue = form.name.trim();
  const emailValue = form.email.trim();
  const passwordValue = form.password.trim();
  const hasSelectedPermissions = expandedPermissions.length > 0;
  const canSave = Boolean(nameValue && emailValue && hasSelectedPermissions && (editing || passwordValue));

  function startCreate() {
    setSelected(null);
    setForm(emptyForm);
    setError(null);
  }

  function startEdit(admin: ManagedAdmin) {
    setSelected(admin);
    setForm({
      name: admin.name,
      email: admin.email,
      password: '',
      is_active: admin.is_active,
      permissions: admin.permissions,
    });
    setError(null);
  }

  function togglePermission(permission: AdminPermission) {
    setForm((current) => ({
      ...current,
      permissions: current.permissions.includes(permission)
        ? current.permissions.filter((item) => item !== permission)
        : expandPermissions([...current.permissions, permission]),
    }));
  }

  async function submit() {
    setSaving(true);
    setError(null);
    try {
      if (!canSave) {
        setError(
          editing
            ? 'Ad, e-poçt və ən azı bir icazə daxil edilməlidir.'
            : 'Ad, e-poçt, şifrə və ən azı bir icazə daxil edilməlidir.',
        );
        return;
      }

      if (selected) {
        await adminsService.update(selected.id, {
          name: nameValue,
          email: emailValue,
          is_active: form.is_active,
          permissions: expandedPermissions,
          ...(passwordValue ? { password: passwordValue } : {}),
        });
      } else {
        await adminsService.create({
          name: nameValue,
          email: emailValue,
          password: passwordValue,
          is_active: form.is_active,
          permissions: expandedPermissions,
        });
      }
      await admins.reload();
      startCreate();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Admin yadda saxlanılmadı.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Adminlər"
        description="Super Admin burada məhdud admin hesabları yaradır və icazələri təyin edir."
        actions={(
          <button className="btn primary" type="button" onClick={startCreate}>
            <Plus size={16} />
            Yeni admin
          </button>
        )}
      />

      <div className="split-layout">
        <section className="panel">
          <div className="panel-heading">
            <div>
              <h2>Admin siyahısı</h2>
              <p>Məhdud adminlər yalnız verilən icazələr üzrə bölmələri görür.</p>
            </div>
          </div>

          {admins.loading ? <LoadingState /> : null}
          {admins.error ? <ErrorState message={admins.error} onRetry={admins.reload} /> : null}
          {admins.data ? (
            admins.data.data.length === 0 ? (
              <EmptyState message="Hələ admin yaradılmayıb." />
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Ad</th>
                      <th>E-poçt</th>
                      <th>Status</th>
                      <th>İcazə sayı</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {admins.data.data.map((admin) => (
                      <tr key={admin.id}>
                        <td>
                          <strong>{admin.name}</strong>
                          <span className="table-subtext">Admin Panel</span>
                        </td>
                        <td>{admin.email}</td>
                        <td>
                          <span className={`badge ${admin.is_active ? 'status-approved' : 'status-inactive'}`}>
                            {admin.is_active ? 'Aktiv' : 'Deaktiv'}
                          </span>
                        </td>
                        <td>{admin.permissions.length}</td>
                        <td>
                          <button className="link-btn" type="button" onClick={() => startEdit(admin)}>
                            Redaktə et
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : null}
        </section>

        <section className="panel admin-editor-panel">
          <div className="panel-heading">
            <div>
              <h2>{editing ? 'Admini redaktə et' : 'Yeni admin yarat'}</h2>
              <p>Admin hesabı ictimai qeydiyyatdan yaradılmır.</p>
            </div>
            <ShieldCheck size={22} />
          </div>

          <div className="form-stack">
            <label className="field">
              <span>Ad</span>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
            </label>
            <label className="field">
              <span>E-poçt</span>
              <input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} />
            </label>
            <label className="field">
              <span>{editing ? 'Yeni şifrə (boş saxlanılsa dəyişmir)' : 'Şifrə'}</span>
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
              />
            </label>
            <label className="switch-row">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
              />
              <span>Admin aktivdir</span>
            </label>

            <div className="permission-groups">
              {permissionGroups.map((group) => (
                <div className="permission-group" key={group.title}>
                  <strong>{group.title}</strong>
                  <div className="permission-grid">
                    {group.permissions.map((permission) => (
                      <label className="choice-row" key={permission}>
                        <input
                          type="checkbox"
                          checked={selectedIds.has(permission)}
                          disabled={isRequiredBySelectedPermissions(permission, form.permissions)}
                          onChange={() => togglePermission(permission)}
                        />
                        <span>{permissionLabels[permission]}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {error ? <p className="inline-note error-note">{error}</p> : null}

            <button className="btn primary full" type="button" disabled={saving || !canSave} onClick={() => void submit()}>
              <Save size={16} />
              {saving ? 'Yadda saxlanılır...' : 'Yadda saxla'}
            </button>
            {editing ? (
              <button className="btn secondary full" type="button" onClick={startCreate}>
                Yeni admin formuna keç
              </button>
            ) : null}
          </div>

          <datalist id="permission-list">
            {ADMIN_PERMISSIONS.map((permission) => <option key={permission} value={permission} />)}
          </datalist>
        </section>
      </div>
    </>
  );
}
