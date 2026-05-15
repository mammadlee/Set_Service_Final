import { Errors } from './errors';

const e164Regex = /^\+[1-9]\d{7,14}$/;

export function normalizePhone(phone: string): string {
  const normalized = phone.replace(/[\s().-]/g, '');
  if (!e164Regex.test(normalized)) {
    throw Errors.badRequest('Phone number must be in E.164 format, for example +994501234567', 'INVALID_PHONE');
  }
  return normalized;
}
