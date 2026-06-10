/**
 * 통합 엑셀 다운로드 생성 (PRD §4.9 F9)
 *
 * 시트 순서:
 *   1. 1단계(STO)        — 원본 시트명·컬럼 유지
 *   2. 2단계(물류분배)
 *   3. 3단계(피킹지시서패션)
 *   4. 4단계(EAN)
 *   5. 출력1. 관리용 문서
 *   6. 출력2. 피킹지시서
 *   7. 출력3. 파렛트
 *   8. ETC 리포트
 *
 * 파일명: {출고지}점_데일리 작업지시서_YYYYMMDD.xlsx
 */
import * as XLSX from "xlsx";

import { formatDateCompact, formatDateDot } from "@/lib/dates";
import type { JobRecord } from "@/lib/job/store";
import type { ParsedSheet } from "@/lib/parser/xlsx";
import { sanitizeAoa } from "./sanitize";

/** RAW 시트를 양식 그대로 (헤더+행) 새 워크북에 추가 */
function rawSheetToAoa(sheet: ParsedSheet): (string | number | boolean | null)[][] {
  return [sheet.headers, ...sheet.rows];
}

interface ExportInput {
  job: JobRecord;
}

export function buildIntegratedWorkbook(input: ExportInput): {
  buffer: ArrayBuffer;
  filename: string;
} {
  const { job } = input;
  const stages = job.data.stages;
  const out1 = job.data.output1?.output1 ?? [];
  const outletName = job.data.output1?.outletName ?? "강서";
  const o23 = job.data.outputs23;
  const wb = XLSX.utils.book_new();

  // RAW 1~4 (M9: formula injection 방어 위해 sanitize, 누적 저장분만)
  const rawList: Array<[ParsedSheet | null, string]> = [
    [stages.stage1, "1단계(STO)"],
    [stages.stage2, "2단계(물류분배)"],
    [stages.stage3, "3단계(피킹지시서패션)"],
    [stages.stage4, "4단계(EAN)"],
  ];
  for (const [sheet, name] of rawList) {
    if (!sheet) continue;
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.aoa_to_sheet(sanitizeAoa(rawSheetToAoa(sheet))),
      name
    );
  }

  // 출력1. 관리용 문서
  const out1Header = ["구매그룹", "플랜트", "출고지", "수량", "납품번호", "PG번호", "브랜드"];
  const out1Rows = out1.map((r) => [
    r.purchaseGroup,
    r.plnt,
    r.outletName,
    r.qty,
    r.deliveryNo,
    r.pgNumber || (job.pgNumbers[r.plnt] ?? ""),
    r.brand,
  ]);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(sanitizeAoa([out1Header, ...out1Rows])),
    "출력1. 관리용 문서"
  );

  // 출력2. 피킹지시서 — 양식 그대로 (12 컬럼, 복종/비고 포함)
  const out2Header = [
    "브랜드",
    "소스빈",
    "박스번호",
    "자재코드",
    "EAN",
    "자재그룹",
    "자재그룹명",
    "피킹수량",
    "미피킹수량",
    "비고",
    "복종",
    "아이템",
  ];
  const out2Rows = (o23?.output2 ?? []).map((r) => [
    r.brand,
    r.sourceBin,
    r.boxNo,
    r.material,
    r.ean,
    r.matGroup,
    r.matGroupName,
    r.pickQty,
    r.unpickedQty,
    r.remark,
    r.bokjong,
    r.item,
  ]);
  // 출력2 양식엔 R1·R2가 머리글이지만 PRD §F9는 시트 양식 보존만 명시. 머리글은
  // 인쇄용이라 엑셀에는 단순 헤더만 둔다.
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(sanitizeAoa([out2Header, ...out2Rows])),
    "출력2. 피킹지시서"
  );

  // 출력3. 파렛트
  const out3Header = ["브랜드", "소스빈"];
  const out3HeaderLine = `${outletName}점_데일리 출고일 : ${formatDateDot(new Date())}`;
  const out3Rows = (o23?.output3 ?? []).map((r) => [r.brand, r.sourceBin]);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(
      sanitizeAoa([[out3HeaderLine, ""], out3Header, ...out3Rows])
    ),
    "출력3. 파렛트"
  );

  // ETC 리포트
  const etcHeader = [
    "자재코드",
    "새 소스빈",
    "박스번호",
    "브랜드",
    "자재그룹",
    "자재그룹명",
    "피킹수량",
    "첫글자",
    "분류",
  ];
  const etcRows = (o23?.etc ?? []).map((r) => [
    r.material,
    r.newBin,
    r.boxNo,
    r.brand,
    r.matGroup,
    r.matGroupName,
    r.pickQty,
    r.firstChar,
    r.classification,
  ]);
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet(sanitizeAoa([etcHeader, ...etcRows])),
    "ETC 리포트"
  );

  const filename = `${outletName}점_데일리 작업지시서_${formatDateCompact(new Date())}.xlsx`;
  const out = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return { buffer: out as ArrayBuffer, filename };
}
