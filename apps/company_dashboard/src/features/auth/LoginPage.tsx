import { Building2, Clock, ShieldAlert } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../app/auth/AuthProvider';
import { getAccountStatus, getErrorMessage, isApiError } from '../../shared/api/http';
import { accountState, appStrings, statusLabel } from '../../shared/i18n/appStrings';
import { authService } from './auth.service';

export function LoginPage() {
  const { isAuthenticated, setSession } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [reviewerOtp, setReviewerOtp] = useState('');
  const [reviewerOtpRequired, setReviewerOtpRequired] = useState(false);
  const [blockedStatus, setBlockedStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated) return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setBlockedStatus(null);

    try {
      const session = await authService.loginCompany(
        email.trim(),
        password,
        reviewerOtpRequired ? reviewerOtp : undefined,
      );
      setSession(session.user);
    } catch (err) {
      if (isApiError(err) && err.code === 'REVIEWER_OTP_REQUIRED') {
        setReviewerOtpRequired(true);
        setReviewerOtp('');
        return;
      }
      const status = getAccountStatus(err);
      if (status) setBlockedStatus(status);
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-row login-brand">
          <div className="brand-mark">H</div>
          <div>
            <strong>{appStrings.auth.title}</strong>
            <span>{appStrings.auth.subtitle}</span>
          </div>
        </div>

        <div className="auth-heading">
          {blockedStatus ? <ShieldAlert size={32} /> : <Building2 size={32} />}
          <div>
            <h1>{appStrings.auth.loginTitle}</h1>
            <p>{appStrings.auth.loginDescription}</p>
          </div>
        </div>

        {blockedStatus ? <ApprovalNotice status={blockedStatus} /> : null}

        <form onSubmit={(event) => void submit(event)} className="form-stack">
          <label className="field">
            <span>{appStrings.auth.email}</span>
            <input
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setReviewerOtp('');
                setReviewerOtpRequired(false);
              }}
              disabled={loading}
              placeholder={appStrings.auth.emailPlaceholder}
              type="email"
              required
            />
          </label>

          <label className="field">
            <span>{appStrings.auth.password}</span>
            <input
              value={password}
              onChange={(event) => {
                setPassword(event.target.value);
                setReviewerOtp('');
                setReviewerOtpRequired(false);
              }}
              disabled={loading}
              placeholder={appStrings.auth.passwordPlaceholder}
              type="password"
              minLength={8}
              required
            />
          </label>

          {reviewerOtpRequired ? (
            <label className="field">
              <span>{appStrings.auth.reviewerOtp}</span>
              <input
                value={reviewerOtp}
                onChange={(event) => setReviewerOtp(event.target.value.replace(/\D/g, '').slice(0, 6))}
                disabled={loading}
                placeholder={appStrings.auth.reviewerOtpPlaceholder}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                minLength={6}
                maxLength={6}
                required
              />
              <small>{appStrings.auth.reviewerOtpHelp}</small>
            </label>
          ) : null}

          {error && !blockedStatus ? <div className="form-error">{error}</div> : null}

          <button
            className="btn primary full"
            type="submit"
            disabled={
              loading ||
              email.trim().length < 5 ||
              password.length < 8 ||
              (reviewerOtpRequired && !/^\d{6}$/.test(reviewerOtp))
            }
          >
            {loading ? appStrings.auth.wait : appStrings.auth.loginButton}
          </button>
        </form>

      </section>
    </main>
  );
}

function ApprovalNotice({ status }: { status: string }) {
  const state = accountState(status);
  return (
    <div className="approval-notice">
      <Clock size={18} />
      <div>
        <strong>{state.title}</strong>
        <span>{appStrings.accountState.currentStatus}: {statusLabel(status)}. {state.body}</span>
      </div>
    </div>
  );
}
