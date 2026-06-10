/**
 * CSV/Excel formula injection 방어 (PRD M9 / OWASP CSV-Injection)
 *
 * 사용자가 셀에 `=cmd|"/c calc"!A0` 같은 수식을 넣었을 때, 다운로더가 Excel/LibreOffice/Numbers로
 * 열면 자동 평가되어 RCE/정보유출이 발생할 수 있다. 위험한 prefix가 있으면 `'`(작은따옴표)를
 * 앞에 붙여 텍스트로 강제 해석되게 한다.
 *
 * 참고: OWASP CSV Injection - https://owasp.org/www-community/attacks/CSV_Injection
 */

const DANGEROUS_PREFIX = /^[=+\-@\t\r\n]/;

export function sanitizeCell<T>(v: T): T {
  if (typeof v !== "string") return v;
  if (DANGEROUS_PREFIX.test(v)) {
    return ("'" + v) as unknown as T;
  }
  return v;
}

/** 행(셀 배열) 전체에 적용 */
export function sanitizeRow<T>(row: ReadonlyArray<T>): T[] {
  return row.map(sanitizeCell);
}

/** 2D AOA(rows x cols) 전체에 적용 */
export function sanitizeAoa<T>(aoa: ReadonlyArray<ReadonlyArray<T>>): T[][] {
  return aoa.map(sanitizeRow);
}
