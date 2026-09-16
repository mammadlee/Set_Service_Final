import {
  Building2,
  CheckCircle2,
  KeyRound,
  MailCheck,
  PhoneCall,
} from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { CompanyEnrollmentSession } from '../../shared/api/types';
import { getErrorMessage } from '../../shared/api/http';
import { appStrings } from '../../shared/i18n/appStrings';
import { authService } from './auth.service';

type RegistrationStage =
  | 'company'
  | 'phone_code'
  | 'password'
  | 'resume'
  | 'email_code'
  | 'complete';

export function RegistrationPage() {
  const copy = appStrings.registration;
  const [stage, setStage] = useState<RegistrationStage>('company');
  const [companyName, setCompanyName] = useState('');
  const [contactName, setContactName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [phoneCode, setPhoneCode] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [otpChallenge, setOtpChallenge] = useState('');
  const [password, setPassword] = useState('');
  const [passwordAgain, setPasswordAgain] = useState('');
  const [registrationToken, setRegistrationToken] = useState('');
  const [emailCodeSent, setEmailCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(action: () => Promise<void>) {
    setLoading(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function switchMode(next: 'company' | 'resume') {
    setStage(next);
    setError(null);
    setEmailCodeSent(false);
  }

  async function routeEnrollment(session: CompanyEnrollmentSession, sendEmailCode: boolean) {
    const token = session.registration_access_token;
    setRegistrationToken(token);
    if (session.company_name) setCompanyName(session.company_name);

    if (!session.email_verified) {
      setStage('email_code');
      if (sendEmailCode) {
        await authService.requestEmailVerification(email.trim(), token);
        setEmailCodeSent(true);
      }
      return;
    }
    setStage('complete');
  }

  function submitCompany(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      await authService.registerCompany({
        name: companyName.trim(),
        contact_name: contactName.trim(),
        email: email.trim(),
        phone: phone.trim(),
      });
      setStage('phone_code');
    });
  }

  function submitPhoneCode(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const result = await authService.verifyRegistrationOtp(phone.trim(), phoneCode.trim());
      setOtpChallenge(result.otp_challenge);
      setStage('password');
    });
  }

  function submitPassword(event: FormEvent) {
    event.preventDefault();
    if (password !== passwordAgain) {
      setError(copy.passwordMismatch);
      return;
    }
    void run(async () => {
      const session = await authService.completeCompanyRegistration(email.trim(), otpChallenge, password);
      await routeEnrollment(session, !session.email_verified);
    });
  }

  function submitResume(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const session = await authService.resumeCompanyEnrollment(email.trim(), password);
      await routeEnrollment(session, false);
    });
  }

  function sendEmailCode() {
    if (!registrationToken) return;
    void run(async () => {
      await authService.requestEmailVerification(email.trim(), registrationToken);
      setEmailCodeSent(true);
    });
  }

  function submitEmailCode(event: FormEvent) {
    event.preventDefault();
    if (!registrationToken) return;
    void run(async () => {
      await authService.confirmEmailVerification(emailCode.trim(), registrationToken);
      setStage('complete');
    });
  }

  return (
    <main className="auth-page registration-page">
      <section className="auth-card registration-card">
        <div className="brand-row login-brand">
          <div className="brand-mark">SET</div>
          <div>
            <strong>{appStrings.auth.title}</strong>
            <span>{appStrings.auth.subtitle}</span>
          </div>
        </div>

        <div className="auth-heading">
          <StageIcon stage={stage} />
          <div>
            <h1>{stageTitle(stage)}</h1>
            <p>{stageDescription(stage)}</p>
          </div>
        </div>

        {(stage === 'company' || stage === 'resume') && (
          <div className="registration-mode" aria-label="Qeydiyyat növü">
            <button className={stage === 'company' ? 'active' : ''} type="button" onClick={() => switchMode('company')}>
              {copy.newRegistration}
            </button>
            <button className={stage === 'resume' ? 'active' : ''} type="button" onClick={() => switchMode('resume')}>
              {copy.resumeRegistration}
            </button>
          </div>
        )}

        {stage === 'company' && (
          <form className="form-grid" onSubmit={submitCompany}>
            <Field label={copy.companyName} value={companyName} onChange={setCompanyName} minLength={2} disabled={loading} />
            <Field label={copy.contactName} value={contactName} onChange={setContactName} minLength={2} disabled={loading} />
            <Field label={appStrings.auth.email} value={email} onChange={setEmail} type="email" disabled={loading} />
            <label className="field">
              <span>{copy.phone}</span>
              <input value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+994501234567" inputMode="tel" disabled={loading} required />
              <small>{copy.phoneHelp}</small>
            </label>
            <button className="btn primary full full-field" type="submit" disabled={loading}>
              {loading ? appStrings.auth.wait : copy.sendPhoneCode}
            </button>
          </form>
        )}

        {stage === 'phone_code' && (
          <form className="form-stack" onSubmit={submitPhoneCode}>
            <CodeField value={phoneCode} onChange={setPhoneCode} disabled={loading} />
            <button className="btn primary full" type="submit" disabled={loading || phoneCode.length !== 6}>
              {loading ? appStrings.auth.wait : copy.verifyCode}
            </button>
          </form>
        )}

        {stage === 'password' && (
          <form className="form-stack" onSubmit={submitPassword}>
            <Field label={appStrings.auth.password} value={password} onChange={setPassword} type="password" minLength={8} disabled={loading} />
            <Field label={copy.repeatPassword} value={passwordAgain} onChange={setPasswordAgain} type="password" minLength={8} disabled={loading} />
            <button className="btn primary full" type="submit" disabled={loading || password.length < 8 || passwordAgain.length < 8}>
              {loading ? appStrings.auth.wait : copy.completeRegistration}
            </button>
          </form>
        )}

        {stage === 'resume' && (
          <form className="form-stack" onSubmit={submitResume}>
            <Field label={appStrings.auth.email} value={email} onChange={setEmail} type="email" disabled={loading} />
            <Field label={appStrings.auth.password} value={password} onChange={setPassword} type="password" minLength={8} disabled={loading} />
            <button className="btn primary full" type="submit" disabled={loading || password.length < 8}>
              {loading ? appStrings.auth.wait : copy.resumeRegistration}
            </button>
          </form>
        )}

        {stage === 'email_code' && (
          <form className="form-stack" onSubmit={submitEmailCode}>
            {emailCodeSent ? (
              <>
                <CodeField value={emailCode} onChange={setEmailCode} disabled={loading} />
                <button className="btn primary full" type="submit" disabled={loading || emailCode.length !== 6}>
                  {loading ? appStrings.auth.wait : copy.verifyCode}
                </button>
                <button className="btn ghost full" type="button" onClick={sendEmailCode} disabled={loading}>
                  {copy.resendEmailCode}
                </button>
              </>
            ) : (
              <button className="btn primary full" type="button" onClick={sendEmailCode} disabled={loading}>
                {loading ? appStrings.auth.wait : copy.sendEmailCode}
              </button>
            )}
          </form>
        )}

        {stage === 'complete' && (
          <div className="registration-success">
            <CheckCircle2 size={44} />
            <strong>{companyName}</strong>
            <span>{copy.successBody}</span>
            <Link className="btn primary full" to="/login">{copy.backToLogin}</Link>
          </div>
        )}

        {error ? <div className="form-error registration-error" role="alert">{error}</div> : null}

        {stage !== 'complete' && (
          <div className="auth-footer-link">
            <Link to="/login">{copy.backToLogin}</Link>
          </div>
        )}
      </section>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  minLength,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'email' | 'password';
  minLength?: number;
  disabled: boolean;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input value={value} onChange={(event) => onChange(event.target.value)} type={type} minLength={minLength} disabled={disabled} required />
    </label>
  );
}

function CodeField({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  return (
    <label className="field">
      <span>{appStrings.registration.code}</span>
      <input
        className="otp-input"
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, '').slice(0, 6))}
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        disabled={disabled}
        required
      />
    </label>
  );
}

function StageIcon({ stage }: { stage: RegistrationStage }) {
  if (stage === 'phone_code') return <PhoneCall size={32} />;
  if (stage === 'password' || stage === 'resume') return <KeyRound size={32} />;
  if (stage === 'email_code') return <MailCheck size={32} />;
  if (stage === 'complete') return <CheckCircle2 size={32} />;
  return <Building2 size={32} />;
}

function stageTitle(stage: RegistrationStage) {
  const copy = appStrings.registration;
  if (stage === 'phone_code') return copy.phoneCodeTitle;
  if (stage === 'password') return copy.passwordTitle;
  if (stage === 'resume') return copy.resumeTitle;
  if (stage === 'email_code') return copy.emailTitle;
  if (stage === 'complete') return copy.successTitle;
  return copy.title;
}

function stageDescription(stage: RegistrationStage) {
  const copy = appStrings.registration;
  if (stage === 'phone_code') return copy.phoneCodeBody;
  if (stage === 'password') return copy.passwordBody;
  if (stage === 'resume') return copy.resumeBody;
  if (stage === 'email_code') return copy.emailBody;
  if (stage === 'complete') return copy.successBody;
  return copy.description;
}
