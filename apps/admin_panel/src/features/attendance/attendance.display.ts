import type { AttendanceDisplayStatus, AttendanceLog } from '../../shared/api/types';
import { appStrings } from '../../shared/i18n/appStrings';

export function attendanceStatus(record: AttendanceLog): AttendanceDisplayStatus {
  if (record.status) return record.status;
  if (!record.checkin_time) return 'missing_incomplete';
  if (!record.checkout_time) return 'currently_working';
  return record.assignment.status === 'completed' ? 'completed' : 'checked_out';
}

export function attendanceStatusLabel(status: AttendanceDisplayStatus): string {
  return {
    not_checked_in: 'Giriş edilməyib',
    currently_working: 'Hazırda işləyir',
    checked_out: 'Çıxış edib',
    completed: 'Tamamlanıb',
    missing_incomplete: 'Natamam davamiyyət',
  }[status];
}

export function attendancePosition(record: AttendanceLog): string {
  return record.job_position
    || record.assignment.position?.name_az
    || record.assignment.category_item?.position?.name_az
    || record.assignment.assigned_category
    || record.assignment.category
    || appStrings.notAvailable;
}

export function formatAttendanceDuration(minutes?: number | null): string {
  if (minutes === null || minutes === undefined) return 'Hesablanmayıb';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} saat ${rest} dəq` : `${rest} dəq`;
}
