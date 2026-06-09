/** 날짜/시각 포매팅 헬퍼 (PRD §4.3 / §4.6 / §4.9) */

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** YYYY.MM.DD */
export function formatDateDot(d: Date): string {
  return `${d.getFullYear()}.${pad2(d.getMonth() + 1)}.${pad2(d.getDate())}`;
}

/** YYYY-MM-DD */
export function formatDateDash(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** YYYYMMDD */
export function formatDateCompact(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

/** MMDD */
export function formatMmDd(d: Date): string {
  return `${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

/**
 * YYYY-MM-DD/HH:MM AM/PM  (PRD §4.6 머리글 1행 중앙)
 */
export function formatPrintTimestamp(d: Date): string {
  const h24 = d.getHours();
  const ampm = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${formatDateDash(d)}/${pad2(h12)}:${pad2(d.getMinutes())} ${ampm}`;
}
