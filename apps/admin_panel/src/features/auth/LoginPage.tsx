import { ShieldCheck } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../app/auth/AuthProvider';
import { getErrorMessage } from '../../shared/api/http';
import { getAdminLandingPath } from '../../shared/auth/permissions';
import { appStrings } from '../../shared/i18n/appStrings';
import { authService } from './auth.service';

export function LoginPage() {
  const { isAuthenticated, setSession, user } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isAuthenticated) return <Navigate to={getAdminLandingPath(user)} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const session = await authService.loginAdmin(email.trim(), password);
      setSession(session.user);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-row login-brand">
          <div className="brand-mark">SET</div>
          <div>
            <strong>{appStrings.auth.title}</strong>
            <span>{appStrings.auth.subtitle}</span>
          </div>
        </div>

        <div className="auth-heading">
          <ShieldCheck size={32} />
          <div>
            <h1>{appStrings.auth.loginTitle}</h1>
            <p>{appStrings.auth.loginDescription}</p>
          </div>
        </div>

        <form onSubmit={(event) => void submit(event)} className="form-stack">
          <label className="field">
            <span>{appStrings.auth.email}</span>
            <input
              value={email}
              onChange={(event) => setEmail(event.target.value)}
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
              onChange={(event) => setPassword(event.target.value)}
              disabled={loading}
              placeholder={appStrings.auth.passwordPlaceholder}
              type="password"
              required
              minLength={8}
            />
          </label>

          {error ? <div className="form-error">{error}</div> : null}

          <button className="btn primary full" type="submit" disabled={loading || email.trim().length < 5 || password.length < 8}>
            {loading ? appStrings.auth.wait : appStrings.auth.loginButton}
          </button>
        </form>
      </section>
    </main>
  );
}
