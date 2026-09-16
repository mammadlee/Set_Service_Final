import { apiRequest } from '../../shared/api/http';
import { tokenStore } from '../../shared/api/tokenStore';
import type {
  CompanyEnrollmentSession,
  TokenResponse,
} from '../../shared/api/types';
import { appStrings } from '../../shared/i18n/appStrings';

export const authService = {
  async loginCompany(email: string, password: string) {
    const result = await apiRequest<TokenResponse>('/auth/company/web-login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    });

    if (result.user.role !== 'company') {
      throw new Error(appStrings.auth.onlyCompany);
    }
    if (result.user.company?.status !== 'approved') {
      throw new Error(appStrings.auth.notApproved);
    }

    tokenStore.setAccessToken(result.access_token);
    return result;
  },

  async logout() {
    try {
      await apiRequest<void>('/auth/company/web-logout', {
        method: 'POST',
        retry: false,
      });
    } finally {
      tokenStore.clear();
    }
  },

  registerCompany(input: { name: string; contact_name: string; email: string; phone: string }) {
    return apiRequest<{ user_id: string; company_id: string; status: string; otp_sent: boolean }>(
      '/auth/company/register',
      { method: 'POST', body: input, auth: false },
    );
  },

  verifyRegistrationOtp(phone: string, otpCode: string) {
    return apiRequest<{ otp_challenge: string }>(
      '/auth/verify-otp',
      {
        method: 'POST',
        body: { phone, otp_code: otpCode, purpose: 'company_registration' },
        auth: false,
      },
    );
  },

  completeCompanyRegistration(email: string, otpChallenge: string, password: string) {
    return apiRequest<CompanyEnrollmentSession>(
      '/auth/company/complete-registration',
      {
        method: 'POST',
        body: { email, otp_challenge: otpChallenge, password },
        auth: false,
      },
    );
  },

  resumeCompanyEnrollment(email: string, password: string) {
    return apiRequest<CompanyEnrollmentSession>(
      '/auth/company/web-enrollment-login',
      { method: 'POST', body: { email, password }, auth: false },
    );
  },

  requestEmailVerification(email: string, registrationToken: string) {
    return apiRequest<{ email_verified: boolean; email_verification_sent: boolean }>(
      '/auth/email-verification/request',
      {
        method: 'POST',
        body: { email },
        auth: false,
        retry: false,
        bearerToken: registrationToken,
      },
    );
  },

  confirmEmailVerification(otpCode: string, registrationToken: string) {
    return apiRequest<{ email_verified: boolean }>(
      '/auth/email-verification/confirm',
      {
        method: 'POST',
        body: { otp_code: otpCode },
        auth: false,
        retry: false,
        bearerToken: registrationToken,
      },
    );
  },

};
