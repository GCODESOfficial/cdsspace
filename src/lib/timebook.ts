export const TIMEBOOK_OFFICE = {
  name: "CDS Space | Branding Agency in Nigeria for Africa and Beyond",
  address: "53 General Edet Akpan Ave, Ewet Housing Estate, Uyo 520105, Akwa Ibom, Nigeria",
  latitude: 5.0064207,
  longitude: 7.9457973,
  radiusMeters: 150,
};

export const TIMEBOOK_SCHEDULE = {
  timezone: "Africa/Lagos",
  workDays: [1, 2, 3, 4, 5],
  clockInMinutes: 9 * 60,
  onTimeGraceMinutes: 9 * 60 + 15,
  halfDayMinutes: 12 * 60,
  breakStartMinutes: 13 * 60,
  breakEndMinutes: 14 * 60,
  clockOutMinutes: 18 * 60,
};

export const WORK_MODES = ["onsite", "hybrid", "remote", "field_assignment", "approved_leave"] as const;
export type WorkMode = typeof WORK_MODES[number];

export const LEAVE_TYPES = [
  "annual",
  "sick",
  "emergency",
  "compassionate",
  "public_holiday",
  "unpaid",
] as const;

export type AttendanceStatus = "early" | "on_time" | "late" | "half_day" | "absent" | "approved_leave";

export function formatWorkMode(mode: string | null | undefined) {
  return (mode || "onsite")
    .replace(/_/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function lagosDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEBOOK_SCHEDULE.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export function lagosMinutes(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TIMEBOOK_SCHEDULE.timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(value.hour) * 60 + Number(value.minute);
}

export function lagosWeekday(dateString = lagosDate()) {
  const day = new Date(`${dateString}T12:00:00+01:00`).getUTCDay();
  return day === 0 ? 7 : day;
}

export function isWorkDay(dateString = lagosDate()) {
  return TIMEBOOK_SCHEDULE.workDays.includes(lagosWeekday(dateString));
}

export function attendanceStatus(clockInAt: string | Date): AttendanceStatus {
  const minutes = lagosMinutes(new Date(clockInAt));
  if (minutes < TIMEBOOK_SCHEDULE.clockInMinutes) return "early";
  if (minutes <= TIMEBOOK_SCHEDULE.onTimeGraceMinutes) return "on_time";
  if (minutes > TIMEBOOK_SCHEDULE.halfDayMinutes) return "half_day";
  return "late";
}

export function statusLabel(status: string | null | undefined) {
  if (!status) return "Not clocked";
  return status.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2 = TIMEBOOK_OFFICE.latitude,
  lon2 = TIMEBOOK_OFFICE.longitude,
) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

export function officeRequiredFor(mode: WorkMode | string, hybridDays: number[] = [], dateString = lagosDate()) {
  const weekday = lagosWeekday(dateString);
  if (mode === "onsite") return true;
  if (mode === "hybrid") return hybridDays.includes(weekday);
  return false;
}

export function locationFlags(input: {
  latitude?: number | null;
  longitude?: number | null;
  accuracy?: number | null;
  clientCapturedAt?: string | null;
}) {
  const flags: string[] = [];
  const hasCoords = Number.isFinite(input.latitude) && Number.isFinite(input.longitude);
  const distance = hasCoords ? distanceMeters(Number(input.latitude), Number(input.longitude)) : null;
  const inside = distance !== null ? distance <= TIMEBOOK_OFFICE.radiusMeters : false;

  if (!hasCoords) flags.push("missing_location");
  if (Number(input.accuracy ?? 0) > 200) flags.push("low_gps_accuracy");
  if (input.clientCapturedAt) {
    const drift = Math.abs(Date.now() - new Date(input.clientCapturedAt).getTime());
    if (drift > 10 * 60 * 1000) flags.push("client_time_drift");
  }

  return { distance, inside, flags };
}

export function workMinutes(clockInAt?: string | null, clockOutAt?: string | null, breakStartAt?: string | null, breakEndAt?: string | null) {
  if (!clockInAt || !clockOutAt) return 0;
  const start = new Date(clockInAt).getTime();
  const end = new Date(clockOutAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;

  let breakMs = 0;
  if (breakStartAt && breakEndAt) {
    breakMs = Math.max(0, new Date(breakEndAt).getTime() - new Date(breakStartAt).getTime());
  } else {
    const date = lagosDate(new Date(clockInAt));
    const officialStart = new Date(`${date}T13:00:00+01:00`).getTime();
    const officialEnd = new Date(`${date}T14:00:00+01:00`).getTime();
    breakMs = Math.max(0, Math.min(end, officialEnd) - Math.max(start, officialStart));
  }

  return Math.max(0, Math.round((end - start - breakMs) / 60000));
}

export function overtimeMinutes(clockOutAt?: string | null) {
  if (!clockOutAt) return 0;
  const date = lagosDate(new Date(clockOutAt));
  const scheduledEnd = new Date(`${date}T18:00:00+01:00`).getTime();
  return Math.max(0, Math.round((new Date(clockOutAt).getTime() - scheduledEnd) / 60000));
}

export function isEarlyLogout(clockOutAt?: string | null) {
  if (!clockOutAt) return false;
  return lagosMinutes(new Date(clockOutAt)) < TIMEBOOK_SCHEDULE.clockOutMinutes;
}

export function attendanceScores(status: AttendanceStatus, totalWorkMinutes = 0, overtime = 0) {
  const attendance = status === "approved_leave"
    ? 100
    : status === "early"
      ? 100
      : status === "on_time"
        ? 95
        : status === "late"
          ? 75
          : status === "half_day"
            ? 45
            : 0;
  const punctuality = status === "early" || status === "on_time" ? 100 : status === "late" ? 70 : status === "half_day" ? 45 : 0;
  const hours = Math.min(100, Math.round((totalWorkMinutes / (8 * 60)) * 100));
  const productivity = Math.round(attendance * 0.4 + punctuality * 0.25 + hours * 0.25 + Math.min(100, overtime / 60 * 10) * 0.1);
  return {
    attendance,
    punctuality,
    work_hours: hours,
    task_completion: null,
    communication: null,
    productivity,
  };
}
