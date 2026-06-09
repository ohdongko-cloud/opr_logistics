/**
 * Vercel Blob 추상화 (PRD §4.10 F10 / M8)
 *
 * BLOB_READ_WRITE_TOKEN 환경변수가 있으면 Blob 사용, 없으면 인메모리 폴백.
 * 인메모리 폴백은 개발/테스트용 — 프로세스 재시작 시 휘발.
 */
import { del as blobDel, head as blobHead, put as blobPut } from "@vercel/blob";

const USE_BLOB = !!process.env.BLOB_READ_WRITE_TOKEN;

/** 폴백 인메모리 store — globalThis 싱글톤으로 HMR 안전 */
const MEM_KEY = Symbol.for("opr-logistics.blob.memory.v1");
type G = typeof globalThis & {
  [k: symbol]: Map<string, Uint8Array> | undefined;
};
const g = globalThis as G;
const mem: Map<string, Uint8Array> =
  g[MEM_KEY] ?? new Map<string, Uint8Array>();
if (!g[MEM_KEY]) g[MEM_KEY] = mem;

export interface PutResult {
  /** 다운로드용 URL (Blob 모드만, 메모리 모드는 빈 문자열) */
  url: string;
  /** 식별자 (메모리 모드와 Blob 모드 공통 — del/get 호출용) */
  key: string;
}

/** JSON 직렬화 가능한 데이터를 업로드 (Blob 모드) 또는 메모리에 저장 */
export async function putBlob(
  pathname: string,
  body: string | Uint8Array | ArrayBuffer,
  opts: { contentType?: string } = {}
): Promise<PutResult> {
  if (USE_BLOB) {
    // @vercel/blob v2는 PutBody에 Uint8Array를 직접 받지 않음 → Buffer로 변환
    const sdkBody: string | Buffer =
      typeof body === "string"
        ? body
        : body instanceof ArrayBuffer
          ? Buffer.from(new Uint8Array(body))
          : Buffer.from(body);
    const res = await blobPut(pathname, sdkBody, {
      access: "public",
      contentType: opts.contentType,
      addRandomSuffix: true,
      allowOverwrite: false,
    });
    return { url: res.url, key: res.url };
  }
  // 폴백: 메모리에 키별 저장
  const bytes =
    typeof body === "string"
      ? new TextEncoder().encode(body)
      : body instanceof ArrayBuffer
        ? new Uint8Array(body)
        : body;
  mem.set(pathname, bytes);
  return { url: "", key: pathname };
}

/** 식별자로 데이터 조회 (없으면 null) */
export async function getBlobAsArrayBuffer(
  key: string
): Promise<ArrayBuffer | null> {
  if (USE_BLOB) {
    // key는 Blob put 결과 URL
    try {
      const meta = await blobHead(key);
      if (!meta) return null;
      const res = await fetch(meta.url);
      if (!res.ok) return null;
      return await res.arrayBuffer();
    } catch {
      return null;
    }
  }
  const buf = mem.get(key);
  if (!buf) return null;
  return buf.buffer.slice(
    buf.byteOffset,
    buf.byteOffset + buf.byteLength
  ) as ArrayBuffer;
}

/** 식별자로 데이터 조회 (UTF-8 JSON 파싱) */
export async function getBlobAsJson<T = unknown>(
  key: string
): Promise<T | null> {
  const buf = await getBlobAsArrayBuffer(key);
  if (!buf) return null;
  const text = new TextDecoder().decode(buf);
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** 키로 삭제 (cron 정리용). 없는 키도 throw 안 함. */
export async function deleteBlob(key: string): Promise<void> {
  if (USE_BLOB) {
    try {
      await blobDel(key);
    } catch {
      // 이미 없거나 권한 문제 — 조용히 무시 (cron 진행 보장)
    }
    return;
  }
  mem.delete(key);
}

export function isBlobEnabled(): boolean {
  return USE_BLOB;
}
