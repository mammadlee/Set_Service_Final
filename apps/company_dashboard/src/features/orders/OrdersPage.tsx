import { Plus, Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { getErrorMessage } from "../../shared/api/http";
import type {
  CreateOrderInput,
  Order,
  OrderStatus,
  TaxonomyDepartment,
  TaxonomyPosition,
} from "../../shared/api/types";
import { ConfirmModal } from "../../shared/components/ConfirmModal";
import { PageHeader } from "../../shared/components/PageHeader";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../shared/components/StateBlock";
import { StatusBadge } from "../../shared/components/StatusBadge";
import { useAsync } from "../../shared/hooks/useAsync";
import { appStrings, statusLabel } from "../../shared/i18n/appStrings";
import { formatDateTime } from "../../shared/utils/format";
import { taxonomyService } from "../taxonomy/taxonomy.service";
import { ordersService } from "./orders.service";

const statuses: Array<OrderStatus | ""> = [
  "",
  "active",
  "draft",
  "completed",
  "cancelled",
];
type OrderHistoryFilter = "active" | "past" | "all";

const emptyForm = {
  title: "",
  description: "",
  category_items: [{ department_id: "", subdepartment_id: "", position_id: "", category: "", required_count: 1, notes: "" }],
  start_datetime: "",
  end_datetime: "",
  location: "",
  pay_rate: "",
  required_skills: "",
  notes: "",
};

export function OrdersPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [historyFilter, setHistoryFilter] =
    useState<OrderHistoryFilter>("active");
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<Order | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const apiStatus = historyFilter === "active" ? "active" : status;
  const taxonomy = useAsync(() => taxonomyService.list(), []);
  const orders = useAsync(
    () => ordersService.list({ page, limit: 20, status: apiStatus, search }),
    [page, apiStatus, search],
  );

  async function submitCreate(event: FormEvent) {
    event.preventDefault();
    setCreating(true);
    setFormError(null);

    try {
      const validation = validateOrderForm(form);
      if (validation) {
        setFormError(validation);
        return;
      }

      await ordersService.create(buildCreateInput(form, taxonomy.data?.data ?? []));
      setForm(emptyForm);
      setShowCreate(false);
      await orders.reload();
    } catch (error) {
      setFormError(getErrorMessage(error));
    } finally {
      setCreating(false);
    }
  }

  async function confirmCancel(reason?: string) {
    if (!cancelTarget) return;
    setCancelling(true);
    setCancelError(null);

    try {
      await ordersService.cancel(cancelTarget.id, reason);
      setCancelTarget(null);
      await orders.reload();
    } catch (error) {
      setCancelError(getErrorMessage(error));
    } finally {
      setCancelling(false);
    }
  }

  function updateCategoryItem(
    index: number,
    patch: Partial<(typeof emptyForm.category_items)[number]>,
  ) {
    setForm((current) => ({
      ...current,
      category_items: current.category_items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    }));
  }

  function addCategoryItem() {
    setForm((current) => ({
      ...current,
      category_items: [
        ...current.category_items,
        { department_id: "", subdepartment_id: "", position_id: "", category: "", required_count: 1, notes: "" },
      ],
    }));
  }

  function removeCategoryItem(index: number) {
    setForm((current) => ({
      ...current,
      category_items:
        current.category_items.length <= 1
          ? current.category_items
          : current.category_items.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  return (
    <>
      <PageHeader
        title={appStrings.orders.title}
        description={appStrings.orders.description}
        actions={
          <button
            className="btn primary compact"
            type="button"
            onClick={() => setShowCreate((value) => !value)}
          >
            <Plus size={16} />
            {showCreate
              ? appStrings.orders.closeForm
              : appStrings.orders.newOrder}
          </button>
        }
      />

      {showCreate ? (
        <section className="panel create-panel">
          <h2>{appStrings.orders.createTitle}</h2>
          <form
            className="form-grid"
            onSubmit={(event) => void submitCreate(event)}
          >
            <label className="field">
              <span>{appStrings.orders.orderTitle}</span>
              <input
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                required
              />
            </label>
            <div className="full-field">
              <div className="panel-heading compact-heading">
                <div>
                  <h3>{appStrings.orders.categoryRequirements}</h3>
                  <p>{appStrings.orders.categoryRequirementsHelp}</p>
                </div>
                <button className="btn secondary compact" type="button" onClick={addCategoryItem}>
                  <Plus size={15} />
                  {appStrings.orders.addCategory}
                </button>
              </div>
              <div className="category-editor">
                {form.category_items.map((item, index) => (
                  <div className="category-row" key={index}>
                    <label className="field">
                      <span>Şöbə</span>
                      <select
                        value={item.department_id}
                        onChange={(event) => updateCategoryItem(index, {
                          department_id: event.target.value,
                          subdepartment_id: "",
                          position_id: "",
                          category: "",
                        })}
                        required
                      >
                        <option value="">Şöbə seç</option>
                        {(taxonomy.data?.data ?? []).map((department) => (
                          <option key={department.id} value={department.id}>{department.name_az}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Departament</span>
                      <select
                        value={item.subdepartment_id}
                        onChange={(event) => updateCategoryItem(index, {
                          subdepartment_id: event.target.value,
                          position_id: "",
                          category: "",
                        })}
                        required
                        disabled={!item.department_id}
                      >
                        <option value="">Departament seç</option>
                        {subdepartmentsFor(taxonomy.data?.data ?? [], item.department_id).map((subdepartment) => (
                          <option key={subdepartment.id} value={subdepartment.id}>{subdepartment.name_az}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Vəzifə</span>
                      <select
                        value={item.position_id}
                        onChange={(event) => {
                          const position = findPosition(taxonomy.data?.data ?? [], event.target.value);
                          updateCategoryItem(index, {
                            position_id: event.target.value,
                            category: position?.name_az ?? "",
                          });
                        }}
                        required
                        disabled={!item.subdepartment_id}
                      >
                        <option value="">Vəzifə seç</option>
                        {positionsFor(taxonomy.data?.data ?? [], item.department_id, item.subdepartment_id).map((position) => (
                          <option key={position.id} value={position.id}>{position.name_az}</option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Say</span>
                      <input
                        type="number"
                        min={1}
                        value={item.required_count}
                        onChange={(event) => updateCategoryItem(index, { required_count: Number(event.target.value) })}
                        required
                      />
                    </label>
                    <label className="field">
                      <span>Qeyd</span>
                      <input
                        value={item.notes}
                        onChange={(event) => updateCategoryItem(index, { notes: event.target.value })}
                        placeholder={appStrings.orders.optional}
                      />
                    </label>
                    <button
                      className="btn ghost compact"
                      type="button"
                      onClick={() => removeCategoryItem(index)}
                      disabled={form.category_items.length <= 1}
                    >
                      {appStrings.orders.removeCategory}
                    </button>
                  </div>
                ))}
              </div>
              {taxonomy.loading ? <p className="muted">Vəzifələr yüklənir...</p> : null}
              {taxonomy.error ? <p className="form-error">{taxonomy.error}</p> : null}
            </div>
            <label className="field">
              <span>{appStrings.orders.payRate}</span>
              <input
                type="number"
                min={0.01}
                step="0.01"
                value={form.pay_rate}
                onChange={(event) =>
                  setForm({ ...form, pay_rate: event.target.value })
                }
                placeholder={appStrings.orders.optional}
              />
            </label>
            <label className="field">
              <span>{appStrings.orders.start}</span>
              <input
                type="datetime-local"
                value={form.start_datetime}
                onChange={(event) =>
                  setForm({ ...form, start_datetime: event.target.value })
                }
                required
              />
            </label>
            <label className="field">
              <span>{appStrings.orders.end}</span>
              <input
                type="datetime-local"
                value={form.end_datetime}
                onChange={(event) =>
                  setForm({ ...form, end_datetime: event.target.value })
                }
                required
              />
            </label>
            <label className="field full-field">
              <span>{appStrings.orders.location}</span>
              <input
                value={form.location}
                onChange={(event) =>
                  setForm({ ...form, location: event.target.value })
                }
                required
              />
            </label>
            <label className="field full-field">
              <span>{appStrings.orders.skills}</span>
              <input
                value={form.required_skills}
                onChange={(event) =>
                  setForm({ ...form, required_skills: event.target.value })
                }
                placeholder={appStrings.orders.skillsPlaceholder}
              />
            </label>
            <label className="field full-field">
              <span>{appStrings.orders.descriptionField}</span>
              <textarea
                rows={4}
                value={form.description}
                onChange={(event) =>
                  setForm({ ...form, description: event.target.value })
                }
                required
              />
            </label>
            <label className="field full-field">
              <span>{appStrings.orders.notes}</span>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(event) =>
                  setForm({ ...form, notes: event.target.value })
                }
                placeholder={appStrings.orders.optional}
              />
            </label>
            {formError ? (
              <div className="form-error full-field">{formError}</div>
            ) : null}
            <div className="action-row full-field">
              <button className="btn primary" type="submit" disabled={creating}>
                {creating
                  ? appStrings.orders.creating
                  : appStrings.orders.create}
              </button>
              <button
                className="btn secondary"
                type="button"
                onClick={() => setShowCreate(false)}
                disabled={creating}
              >
                {appStrings.cancel}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <div className="toolbar">
        <div
          className="segmented-filter"
          role="group"
          aria-label={appStrings.orders.historyFilter}
        >
          {(["active", "past", "all"] as const).map((item) => (
            <button
              key={item}
              className={historyFilter === item ? "active" : ""}
              type="button"
              onClick={() => {
                setHistoryFilter(item);
                setStatus("");
                setPage(1);
              }}
            >
              {appStrings.orders.historyFilters[item]}
            </button>
          ))}
        </div>
        <label className="search-box">
          <Search size={17} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={appStrings.orders.search}
          />
        </label>
        <select
          value={historyFilter === "active" ? "active" : status}
          disabled={historyFilter === "active"}
          onChange={(event) => {
            setStatus(event.target.value as OrderStatus | "");
            setPage(1);
          }}
        >
          {statuses.map((item) => (
            <option key={item || "all"} value={item}>
              {item ? statusLabel(item) : appStrings.allStatuses}
            </option>
          ))}
        </select>
      </div>

      {orders.loading ? <LoadingState /> : null}
      {orders.error ? (
        <ErrorState message={orders.error} onRetry={orders.reload} />
      ) : null}
      {orders.data ? (
        <section className="panel">
          {filterOrders(orders.data.data, historyFilter).length === 0 ? (
            <EmptyState message={appStrings.orders.empty} />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{appStrings.orders.orderTitle}</th>
                    <th>{appStrings.orders.category}</th>
                    <th>{appStrings.orders.status}</th>
                    <th>{appStrings.orders.workers}</th>
                    <th>{appStrings.orders.start}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {filterOrders(orders.data.data, historyFilter).map(
                    (order) => (
                      <tr key={order.id}>
                        <td>
                          <strong>{order.title}</strong>
                          <span className="table-subtext">
                            {order.location}
                          </span>
                        </td>
                        <td>{formatCategoryItems(order)}</td>
                        <td>
                          <StatusBadge status={order.status} />
                        </td>
                        <td>
                          {order.assignment_count}/{order.required_count}
                        </td>
                        <td>{formatDateTime(order.start_datetime)}</td>
                        <td className="row-actions">
                          <Link className="link-btn" to={`/orders/${order.id}`}>
                            {appStrings.view}
                          </Link>
                          <button
                            className="btn danger compact"
                            type="button"
                            disabled={
                              order.status === "cancelled" ||
                              order.status === "completed"
                            }
                            onClick={() => setCancelTarget(order)}
                          >
                            {appStrings.cancel}
                          </button>
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          )}
          <div className="pagination">
            <button
              className="btn secondary compact"
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
            >
              {appStrings.previous}
            </button>
            <span>{appStrings.pageOf(page, orders.data.meta.total_pages)}</span>
            <button
              className="btn secondary compact"
              disabled={page >= orders.data.meta.total_pages}
              onClick={() => setPage(page + 1)}
            >
              {appStrings.next}
            </button>
          </div>
        </section>
      ) : null}

      {cancelError ? <div className="toast-error">{cancelError}</div> : null}
      <ConfirmModal
        open={Boolean(cancelTarget)}
        title={appStrings.orders.cancelTitle}
        message={appStrings.orders.cancelMessage}
        confirmLabel={appStrings.orders.cancelConfirm}
        tone="danger"
        loading={cancelling}
        onCancel={() => setCancelTarget(null)}
        onConfirm={(reason) => void confirmCancel(reason)}
      />
    </>
  );
}

function formatCategoryItems(order: Order): string {
  const items = order.category_items?.length
    ? order.category_items
    : [{ category: order.category, required_count: order.required_count }];
  return items.map((item) => `${item.category} (${item.required_count})`).join(", ");
}

function buildCreateInput(form: typeof emptyForm, departments: TaxonomyDepartment[]): CreateOrderInput {
  const categoryItems = form.category_items.map((item) => ({
    category: findPosition(departments, item.position_id)?.name_az ?? item.category.trim(),
    department_id: item.department_id,
    subdepartment_id: item.subdepartment_id,
    position_id: item.position_id,
    required_count: item.required_count,
    ...(item.notes.trim() ? { notes: item.notes.trim() } : {}),
  }));

  const input: CreateOrderInput = {
    title: form.title.trim(),
    description: form.description.trim(),
    category: categoryItems[0].category,
    required_count: categoryItems.reduce((sum, item) => sum + item.required_count, 0),
    category_items: categoryItems,
    start_datetime: new Date(form.start_datetime).toISOString(),
    end_datetime: new Date(form.end_datetime).toISOString(),
    location: form.location.trim(),
  };

  if (form.pay_rate) input.pay_rate = Number(form.pay_rate);
  if (form.required_skills.trim()) {
    input.required_skills = form.required_skills
      .split(",")
      .map((skill) => skill.trim())
      .filter(Boolean);
  }
  if (form.notes.trim()) input.notes = form.notes.trim();
  return input;
}

function validateOrderForm(form: typeof emptyForm) {
  const start = new Date(form.start_datetime);
  const end = new Date(form.end_datetime);
  const payRate = form.pay_rate.trim() ? Number(form.pay_rate) : null;

  if (form.title.trim().length < 3) return appStrings.orders.invalidTitle;
  if (form.category_items.length < 1) return appStrings.orders.invalidCategory;
  const positionIds = new Set<string>();
  for (const item of form.category_items) {
    if (!item.department_id || !item.subdepartment_id || !item.position_id) return "Şöbə, departament və vəzifə seçilməlidir.";
    if (positionIds.has(item.position_id)) return appStrings.orders.duplicateCategory;
    positionIds.add(item.position_id);
    if (!Number.isFinite(item.required_count) || item.required_count <= 0) return appStrings.orders.invalidCount;
  }
  if (form.location.trim().length < 2) return appStrings.orders.invalidLocation;
  if (form.description.trim().length < 10)
    return appStrings.orders.invalidDescription;
  if (payRate !== null && (Number.isNaN(payRate) || payRate <= 0))
    return appStrings.orders.invalidPayRate;
  if (Number.isNaN(start.getTime()) || start.getTime() <= Date.now())
    return appStrings.orders.invalidStart;
  if (Number.isNaN(end.getTime()) || end.getTime() <= start.getTime())
    return appStrings.orders.invalidEnd;
  return null;
}

function subdepartmentsFor(departments: TaxonomyDepartment[], departmentId: string) {
  return departments.find((department) => department.id === departmentId)?.subdepartments ?? [];
}

function positionsFor(departments: TaxonomyDepartment[], departmentId: string, subdepartmentId: string) {
  return subdepartmentsFor(departments, departmentId).find((subdepartment) => subdepartment.id === subdepartmentId)?.positions ?? [];
}

function findPosition(departments: TaxonomyDepartment[], positionId: string): TaxonomyPosition | null {
  for (const department of departments) {
    for (const subdepartment of department.subdepartments) {
      const position = subdepartment.positions.find((item) => item.id === positionId);
      if (position) return position;
    }
  }
  return null;
}

function filterOrders(orders: Order[], filter: OrderHistoryFilter): Order[] {
  const now = Date.now();

  if (filter === "active") {
    return orders.filter((order) => order.status === "active");
  }

  if (filter === "past") {
    return orders.filter((order) => {
      const end = new Date(order.end_datetime).getTime();
      return (
        order.status === "completed" ||
        order.status === "cancelled" ||
        (!Number.isNaN(end) && end < now)
      );
    });
  }

  return orders;
}
