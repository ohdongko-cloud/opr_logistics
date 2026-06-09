/**
 * 자재그룹 코드 → 복종(W/M) + 아이템(우 2글자) 추출 (PRD §4.4 F4)
 *
 * 규칙:
 *   복종 = code[1]   (왼쪽 2번째 글자)
 *   아이템 = code[-2:] (마지막 2글자)
 *
 * 화이트리스트:
 *   복종 ∈ {W, M}, 그 외는 ETC
 *   길이 < 3 이면 추출 불가 → ETC
 *
 * 실측:
 *   샘플 자재그룹 188행 100% 6글자, [1]∈{M,W} 100%, [-2:] 2글자 알파벳 100%.
 *   예외 케이스는 합성 fixture로 테스트.
 */
export interface MatGroupExtract {
  ok: boolean;
  bokjong: "W" | "M" | "";
  item: string;
  reason?: "too_short" | "invalid_bokjong";
}

export function extractMatGroup(
  code: string | null | undefined
): MatGroupExtract {
  const s = (code ?? "").toString().trim();
  if (s.length < 3) {
    return { ok: false, bokjong: "", item: "", reason: "too_short" };
  }
  const b = s[1]!.toUpperCase();
  if (b !== "W" && b !== "M") {
    return { ok: false, bokjong: "", item: s.slice(-2), reason: "invalid_bokjong" };
  }
  return { ok: true, bokjong: b, item: s.slice(-2) };
}
