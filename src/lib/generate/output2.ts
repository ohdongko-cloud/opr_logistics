/**
 * 출력2 「피킹지시서」 생성 (PRD §4.4 F4)
 *
 * 헤더: 브랜드 | 소스빈 | 박스번호 | 자재코드 | EAN | 자재그룹 | 자재그룹명 |
 *       피킹수량 | 미피킹수량 | 비고 | 복종 | 아이템
 *
 * 분리 키 = (자재코드, 새 소스빈 K[0:9], 박스번호) — 사용자 확정
 * 피킹수량 = 3단계 G열 (행별 원본)
 *
 * EAN 매핑 (PRD 사용자 확정):
 *   4단계의 A열(상품코드)==자재코드 인 행 중
 *     1) EAN코드 == 상품코드 인 행 우선
 *     2) 없으면 첫 행
 *     3) 매칭 0건이면 빈칸 + 경고
 *
 * 검증:
 *   - SUM(피킹수량) == SUM(1단계.Y열) == SUM(3단계.G열)   ← AC12
 */
import { cleanBrand } from "@/lib/parser/brand";
import { extractMatGroup } from "@/lib/parser/matgroup";
import { splitSourceBin } from "@/lib/parser/sourcebin";
import type { ParsedSheet } from "@/lib/parser/xlsx";
import {
  resolveStage1,
  resolveStage3,
  resolveStage4,
} from "@/lib/sheets/columns";
import { asNumber, asString, readCell } from "@/lib/sheets/rows";
import type { EtcRow } from "./output3";

export interface Output2Row {
  brand: string;
  sourceBin: string; // K[0:9]
  boxNo: string;
  material: string;
  ean: string;
  matGroup: string;
  matGroupName: string;
  pickQty: number;
  unpickedQty: string; // 빈칸 (현장 수기)
  remark: string; // 빈칸 (현장 수기)
  bokjong: "W" | "M" | "";
  item: string;
}

export interface Output2Result {
  rows: Output2Row[];
  etcRows: EtcRow[];
  warnings: string[];
  totalPickQty: number;
}

interface EanCandidate {
  productCode: string;
  ean: string;
}

function buildEanMap(stage4: ParsedSheet): Map<string, EanCandidate[]> {
  const s4 = resolveStage4(stage4.headers);
  const map = new Map<string, EanCandidate[]>();
  if (s4.productCode < 0 || s4.eanCode < 0) return map;
  for (const row of stage4.rows) {
    const pc = asString(readCell(row, s4.productCode));
    const ean = asString(readCell(row, s4.eanCode));
    if (!pc) continue;
    const list = map.get(pc);
    if (list) list.push({ productCode: pc, ean });
    else map.set(pc, [{ productCode: pc, ean }]);
  }
  return map;
}

/** 다중 EAN 정책: 자재코드(상품코드) 매칭 행 중 EAN==상품코드 우선, 없으면 첫 행 */
export function pickEan(
  material: string,
  eanMap: Map<string, EanCandidate[]>
): { ean: string; matched: boolean } {
  const list = eanMap.get(material);
  if (!list || list.length === 0) return { ean: "", matched: false };
  const exact = list.find((e) => e.ean === e.productCode);
  if (exact) return { ean: exact.ean, matched: true };
  return { ean: list[0]!.ean, matched: true };
}

function buildBrandMap(stage1: ParsedSheet): Map<string, string> {
  const s1 = resolveStage1(stage1.headers);
  const map = new Map<string, string>();
  if (s1.material < 0 || s1.origBrandName < 0) return map;
  for (const row of stage1.rows) {
    const mat = asString(readCell(row, s1.material));
    const brand = cleanBrand(asString(readCell(row, s1.origBrandName)));
    if (mat && !map.has(mat)) map.set(mat, brand);
  }
  return map;
}

export function generateOutput2(
  stage1: ParsedSheet,
  stage3: ParsedSheet,
  stage4: ParsedSheet
): Output2Result {
  const s3 = resolveStage3(stage3.headers);
  const warnings: string[] = [];

  const missing: string[] = [];
  if (s3.material < 0) missing.push("자재코드");
  if (s3.sourceBin < 0) missing.push("소스 빈");
  if (s3.pickQty < 0) missing.push("피킹 수량");
  if (missing.length > 0) {
    return {
      rows: [],
      etcRows: [],
      warnings: [`3단계 필수 컬럼 누락: ${missing.join(", ")}`],
      totalPickQty: 0,
    };
  }

  const brandMap = buildBrandMap(stage1);
  const eanMap = buildEanMap(stage4);

  // (mat, newBin, boxNo) 분리 키 dedup
  const seen = new Set<string>();
  const rows: Output2Row[] = [];
  const etcRows: EtcRow[] = [];
  let totalPickQty = 0;

  for (const row of stage3.rows) {
    const mat = asString(readCell(row, s3.material));
    if (!mat) continue;
    const rawBin = asString(readCell(row, s3.sourceBin));
    const split = splitSourceBin(rawBin);
    const matGroup =
      s3.matGroup >= 0 ? asString(readCell(row, s3.matGroup)) : "";
    const matGroupName =
      s3.matGroupName >= 0 ? asString(readCell(row, s3.matGroupName)) : "";
    const pickQty = asNumber(readCell(row, s3.pickQty));
    const brand = brandMap.get(mat) ?? "";
    if (!brand) warnings.push(`자재 ${mat}: 브랜드명 매칭 실패`);

    if (!split.ok) {
      warnings.push(`자재 ${mat}: 소스빈 '${rawBin}' 분리 실패 (${split.reason})`);
      continue;
    }

    // ETC 분류 (E 또는 G~Z)
    const firstChar = split.newBin[0]?.toUpperCase() ?? "";
    const isABC = firstChar === "A" || firstChar === "B" || firstChar === "C";
    const isDF = firstChar === "D" || firstChar === "F";

    if (!isABC && !isDF) {
      etcRows.push({
        material: mat,
        newBin: split.newBin,
        boxNo: split.boxNo,
        brand,
        matGroup,
        matGroupName,
        pickQty,
        firstChar,
        classification: firstChar === "E" ? "ETC_E" : "ETC_OTHER",
      });
      continue;
    }

    const key = `${mat} ${split.newBin} ${split.boxNo}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const { ean, matched } = pickEan(mat, eanMap);
    if (!matched) warnings.push(`자재 ${mat}: EAN 매칭 실패`);

    const mg = extractMatGroup(matGroup);
    if (!mg.ok) {
      // 복종 추출 실패 → ETC 리포트로 분리 (PRD F4 화이트리스트)
      etcRows.push({
        material: mat,
        newBin: split.newBin,
        boxNo: split.boxNo,
        brand,
        matGroup,
        matGroupName,
        pickQty,
        firstChar,
        classification: "ETC_OTHER",
      });
      warnings.push(
        `자재 ${mat}: 자재그룹 '${matGroup}' → 복종 추출 실패 (${mg.reason}). ETC로 분리.`
      );
      continue;
    }

    totalPickQty += pickQty;
    rows.push({
      brand,
      sourceBin: split.newBin,
      boxNo: split.boxNo,
      material: mat,
      ean,
      matGroup,
      matGroupName,
      pickQty,
      unpickedQty: "",
      remark: "",
      bokjong: mg.bokjong,
      item: mg.item,
    });
  }

  // ETC도 새 소스빈 오름차순
  etcRows.sort((a, b) => a.newBin.localeCompare(b.newBin));

  return { rows, etcRows, warnings, totalPickQty };
}
