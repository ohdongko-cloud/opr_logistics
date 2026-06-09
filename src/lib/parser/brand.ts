/**
 * 브랜드명 정제 (PRD §4.2 F2)
 *   - 괄호와 그 안의 내용 전체 삭제 (반각·전각 모두)
 *   - 다중 공백 1개로 압축, 양끝 trim
 *   - 괄호 밖의 영문/한글은 손대지 않음
 *
 * 예:
 *   '로씨로씨(ROCCI ROCCI)'          → '로씨로씨'
 *   '리오벨 (LIOBELL)'               → '리오벨'
 *   '캘빈 클라인 진(CALVIN KLEIN JEANS)' → '캘빈 클라인 진'
 *   'LF종합관'                       → 'LF종합관'
 *   '리바이스'                       → '리바이스'
 *   '전각（FULL）'                    → '전각'
 */
export function cleanBrand(raw: string | null | undefined): string {
  if (raw === null || raw === undefined) return "";
  let s = String(raw).normalize("NFKC");
  // 반각 ( ... ) + 전각 （ ... ）
  s = s.replace(/\s*[(（][^)）]*[)）]\s*/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  return s;
}
