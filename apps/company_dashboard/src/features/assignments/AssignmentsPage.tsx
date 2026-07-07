import { QrCode, Search, Star } from "lucide-react";
import { useState } from "react";
import { getErrorMessage } from "../../shared/api/http";
import type {
  Assignment,
  AssignmentStatus,
  CompanyWorkerProfile,
  QrTokenResponse,
} from "../../shared/api/types";
import { PageHeader } from "../../shared/components/PageHeader";
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from "../../shared/components/StateBlock";
import { StatusBadge } from "../../shared/components/StatusBadge";
import { useAsync } from "../../shared/hooks/useAsync";
import { appStrings, statusLabel } from "../../shared/i18n/appStrings";
import { normalizeDocuments } from "../../shared/utils/documents";
import { formatDateTime } from "../../shared/utils/format";
import { attendanceService } from "../attendance/attendance.service";
import { workersService } from "../workers/workers.service";
import { assignmentsService } from "./assignments.service";

const statuses: Array<AssignmentStatus | ""> = [
  "",
  "assigned",
  "accepted",
  "rejected",
  "completed",
  "cancelled",
];

export function AssignmentsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<AssignmentStatus | "">("");
  const [orderId, setOrderId] = useState("");
  const [workerId, setWorkerId] = useState("");
  const [qr, setQr] = useState<QrTokenResponse | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [workerProfile, setWorkerProfile] =
    useState<CompanyWorkerProfile | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [ratingTarget, setRatingTarget] = useState<Assignment | null>(null);
  const [ratingScore, setRatingScore] = useState(5);
  const [ratingFeedback, setRatingFeedback] = useState("");
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [ratingSuccess, setRatingSuccess] = useState<string | null>(null);
  const [ratingLoading, setRatingLoading] = useState(false);
  const assignments = useAsync(async () => {
    const assignmentPage = await assignmentsService.list({
      page,
      limit: 20,
      status,
      order_id: orderId.trim() || undefined,
      worker_id: workerId.trim() || undefined,
    });
    const completedAttendanceIds = new Set<string>();

    await Promise.all(
      assignmentPage.data
        .filter(isPotentiallyRateableAssignment)
        .map(async (assignment) => {
          const attendance = await attendanceService.list({
            assignment_id: assignment.id,
            limit: 1,
            sort: "desc",
          });
          if (attendance.data.some((record) => Boolean(record.checkout_time))) {
            completedAttendanceIds.add(assignment.id);
          }
        }),
    );

    return { assignmentPage, completedAttendanceIds };
  }, [page, status, orderId, workerId]);

  async function generateQr(assignment: Assignment) {
    setWorkingId(assignment.id);
    setQrError(null);

    try {
      setQr(await attendanceService.generateQrToken(assignment.id));
    } catch (error) {
      setQrError(getErrorMessage(error));
    } finally {
      setWorkingId(null);
    }
  }

  async function openWorkerProfile(workerId: string) {
    setWorkingId(workerId);
    setProfileError(null);
    try {
      setWorkerProfile(await workersService.getCompanyProfile(workerId));
    } catch (error) {
      setProfileError(getErrorMessage(error));
    } finally {
      setWorkingId(null);
    }
  }

  async function submitRating() {
    if (!ratingTarget) return;
    if (ratingScore < 1 || ratingScore > 5) {
      setRatingError(appStrings.assignments.invalidRating);
      return;
    }
    setRatingLoading(true);
    setRatingError(null);
    setRatingSuccess(null);
    try {
      await assignmentsService.rate({
        assignment_id: ratingTarget.id,
        score: ratingScore,
        feedback: ratingFeedback.trim() || undefined,
      });
      setRatingTarget(null);
      setRatingFeedback("");
      setRatingScore(5);
      setRatingSuccess(appStrings.assignments.ratingSuccess);
      await assignments.reload();
    } catch (error) {
      setRatingError(getErrorMessage(error));
    } finally {
      setRatingLoading(false);
    }
  }

  const assignmentData = assignments.data;

  return (
    <>
      <PageHeader
        title={appStrings.assignments.title}
        description={appStrings.assignments.description}
      />

      <div className="toolbar">
        <label className="search-box">
          <Search size={17} />
          <input
            value={orderId}
            onChange={(event) => setOrderId(event.target.value)}
            placeholder={appStrings.assignments.filterByOrderId}
          />
        </label>
        <label className="search-box">
          <Search size={17} />
          <input
            value={workerId}
            onChange={(event) => setWorkerId(event.target.value)}
            placeholder={appStrings.assignments.filterByWorkerId}
          />
        </label>
        <select
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as AssignmentStatus | "")
          }
        >
          {statuses.map((item) => (
            <option key={item || "all"} value={item}>
              {item ? statusLabel(item) : appStrings.allStatuses}
            </option>
          ))}
        </select>
      </div>
      {qrError ? <div className="form-error">{qrError}</div> : null}
      {profileError ? <div className="form-error">{profileError}</div> : null}
      {ratingSuccess ? (
        <div className="toast-success">{ratingSuccess}</div>
      ) : null}

      {assignments.loading ? <LoadingState /> : null}
      {assignments.error ? (
        <ErrorState message={assignments.error} onRetry={assignments.reload} />
      ) : null}
      {assignmentData ? (
        <section className="panel">
          {assignmentData.assignmentPage.data.length === 0 ? (
            <EmptyState message={appStrings.assignments.empty} />
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{appStrings.assignments.worker}</th>
                    <th>{appStrings.assignments.order}</th>
                    <th>{appStrings.assignments.status}</th>
                    <th>{appStrings.assignments.shift}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {assignmentData.assignmentPage.data.map((assignment) => {
                    const checkoutCompleted =
                      assignmentData.completedAttendanceIds.has(assignment.id);
                    const canRate =
                      isPotentiallyRateableAssignment(assignment) &&
                      checkoutCompleted;

                    return (
                      <tr key={assignment.id}>
                        <td>
                          <strong>{assignment.worker.name}</strong>
                          <span className="table-subtext">
                            {assignment.worker.position ||
                              appStrings.assignments.workerFallback}
                          </span>
                        </td>
                        <td>
                          {assignment.order.title}
                          <span className="table-subtext">
                            {assignment.order.location}
                          </span>
                        </td>
                        <td>
                          <StatusBadge status={assignment.status} />
                        </td>
                        <td>
                          {formatDateTime(assignment.order.start_datetime)}
                        </td>
                        <td>
                          <button
                            className="btn secondary compact"
                            type="button"
                            disabled={
                              assignment.status !== "accepted" ||
                              assignment.order.status !== "active" ||
                              workingId === assignment.id
                            }
                            onClick={() => void generateQr(assignment)}
                          >
                            <QrCode size={15} />
                            {appStrings.assignments.generateQr}
                          </button>
                          <button
                            className="btn ghost compact"
                            type="button"
                            disabled={workingId === assignment.worker.id}
                            onClick={() =>
                              void openWorkerProfile(assignment.worker.id)
                            }
                          >
                            {appStrings.assignments.viewWorkerProfile}
                          </button>
                          {isPotentiallyRateableAssignment(assignment) ? (
                            <button
                              className="btn secondary compact"
                              type="button"
                              disabled={!canRate}
                              onClick={() => {
                                setRatingTarget(assignment);
                                setRatingError(null);
                                setRatingSuccess(null);
                              }}
                            >
                              <Star size={15} />
                              {canRate
                                ? appStrings.assignments.rateWorker
                                : appStrings.assignments.checkoutIncomplete}
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
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
            <span>
              {appStrings.pageOf(
                page,
                assignmentData.assignmentPage.meta.total_pages,
              )}
            </span>
            <button
              className="btn secondary compact"
              disabled={page >= assignmentData.assignmentPage.meta.total_pages}
              onClick={() => setPage(page + 1)}
            >
              {appStrings.next}
            </button>
          </div>
        </section>
      ) : null}

      <QrTokenModal qr={qr} onClose={() => setQr(null)} />
      <WorkerProfileModal
        profile={workerProfile}
        onClose={() => setWorkerProfile(null)}
      />
      <RatingModal
        assignment={ratingTarget}
        score={ratingScore}
        feedback={ratingFeedback}
        error={ratingError}
        loading={ratingLoading}
        onScore={setRatingScore}
        onFeedback={setRatingFeedback}
        onClose={() => setRatingTarget(null)}
        onSubmit={() => void submitRating()}
      />
    </>
  );
}

function isPotentiallyRateableAssignment(assignment: Assignment): boolean {
  return assignment.status === "accepted" || assignment.status === "completed";
}

function RatingModal({
  assignment,
  score,
  feedback,
  error,
  loading,
  onScore,
  onFeedback,
  onClose,
  onSubmit,
}: {
  assignment: Assignment | null;
  score: number;
  feedback: string;
  error: string | null;
  loading: boolean;
  onScore: (score: number) => void;
  onFeedback: (feedback: string) => void;
  onClose: () => void;
  onSubmit: () => void;
}) {
  if (!assignment) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rating-title"
      >
        <div className="modal-header">
          <h2 id="rating-title">{appStrings.assignments.ratingTitle}</h2>
          <button
            className="icon-btn"
            type="button"
            onClick={onClose}
            aria-label={appStrings.close}
          >
            ×
          </button>
        </div>
        <p className="muted">{appStrings.assignments.ratingDescription}</p>
        <p>
          <strong>{assignment.worker.name}</strong> · {assignment.order.title}
        </p>
        <label className="field">
          <span>{appStrings.assignments.ratingScore}</span>
          <select
            value={score}
            onChange={(event) => onScore(Number(event.target.value))}
          >
            {[5, 4, 3, 2, 1].map((item) => (
              <option key={item} value={item}>
                {item}/5
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>{appStrings.assignments.ratingFeedback}</span>
          <textarea
            rows={4}
            value={feedback}
            onChange={(event) => onFeedback(event.target.value)}
            placeholder={appStrings.assignments.ratingFeedbackPlaceholder}
          />
        </label>
        {error ? <div className="form-error">{error}</div> : null}
        <div className="modal-actions">
          <button
            className="btn secondary"
            type="button"
            onClick={onClose}
            disabled={loading}
          >
            {appStrings.cancel}
          </button>
          <button
            className="btn primary"
            type="button"
            onClick={onSubmit}
            disabled={loading}
          >
            {loading ? appStrings.working : appStrings.assignments.ratingSubmit}
          </button>
        </div>
      </div>
    </div>
  );
}

function WorkerProfileModal({
  profile,
  onClose,
}: {
  profile: CompanyWorkerProfile | null;
  onClose: () => void;
}) {
  if (!profile) return null;
  const documents = normalizeDocuments(profile.documents);

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal wide-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="worker-profile-title"
      >
        <div className="modal-header">
          <h2 id="worker-profile-title">{appStrings.workerProfile.title}</h2>
          <button
            className="icon-btn"
            type="button"
            onClick={onClose}
            aria-label={appStrings.close}
          >
            ×
          </button>
        </div>
        <p className="muted">{appStrings.workerProfile.description}</p>
        <p className="muted">{appStrings.workerProfile.contactHidden}</p>
        <dl className="detail-list">
          <dt>{appStrings.assignments.worker}</dt>
          <dd>{profile.name}</dd>
          <dt>{appStrings.workerProfile.position}</dt>
          <dd>{profile.position || appStrings.notAvailable}</dd>
          <dt>{appStrings.workerProfile.skills}</dt>
          <dd>{formatList(profile.skills)}</dd>
          <dt>{appStrings.workerProfile.languages}</dt>
          <dd>{formatList(profile.languages)}</dd>
          <dt>{appStrings.workerProfile.workHistory}</dt>
          <dd>
            {profile.work_history_summary || appStrings.workerProfile.noData}
          </dd>
          <dt>{appStrings.workerProfile.rating}</dt>
          <dd>
            {profile.rating_avg} ({profile.rating_count})
          </dd>
        </dl>
        <h3>{appStrings.workerProfile.documents}</h3>
        {documents.length === 0 ? (
          <p className="muted">{appStrings.workerProfile.noDocuments}</p>
        ) : (
          <div className="document-list">
            {documents.map((document, index) => (
              <div className="document-row" key={`${document.type}-${index}`}>
                <span>{document.name || document.type}</span>
                <a href={document.url} target="_blank" rel="noreferrer">
                  {appStrings.view}
                </a>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function formatList(value: unknown): string {
  if (!Array.isArray(value)) return appStrings.workerProfile.noData;
  const items = value
    .map((item) => {
      if (typeof item === "string") return item;
      if (item && typeof item === "object" && "name" in item)
        return String(item.name);
      return "";
    })
    .filter(Boolean);
  return items.length ? items.join(", ") : appStrings.workerProfile.noData;
}

function QrTokenModal({
  qr,
  onClose,
}: {
  qr: QrTokenResponse | null;
  onClose: () => void;
}) {
  if (!qr) return null;

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal wide-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="qr-title"
      >
        <div className="modal-header">
          <h2 id="qr-title">{appStrings.assignments.qrTitle}</h2>
          <button
            className="icon-btn"
            type="button"
            onClick={onClose}
            aria-label={appStrings.close}
          >
            ×
          </button>
        </div>
        <p className="muted">
          {appStrings.assignments.qrDescription(formatDateTime(qr.expires_at))}
        </p>
        <textarea className="token-box" value={qr.token} readOnly rows={5} />
        <div className="modal-actions">
          <button
            className="btn secondary"
            type="button"
            onClick={() => void navigator.clipboard.writeText(qr.token)}
          >
            {appStrings.assignments.copyToken}
          </button>
          <button className="btn primary" type="button" onClick={onClose}>
            {appStrings.assignments.done}
          </button>
        </div>
      </div>
    </div>
  );
}
