# OPR Logistics — 피킹지시서 자동 분류·출력 웹서비스

> 강서점 데일리 피킹지시서를 RAW 엑셀 4종에서 자동 생성·인쇄·다운로드.
> PRD: [`docs/prd/0001-picking-instruction-webservice.md`](./docs/prd/0001-picking-instruction-webservice.md)

## 스택
- Next.js 15 (App Router, TypeScript, Turbopack)
- Tailwind CSS v4 + Sonner (toast)
- Drizzle ORM + Neon (Postgres)
- Vercel Blob (RAW + 결과물 저장)
- SheetJS xlsx (RAW 파싱)
- Vitest (단위테스트)
- Vercel Cron (7일 TTL 자동 삭제)

## 진행 단계 (M1~M6)
- [x] **M1**: PRD 작성 + 리뷰 게이트 통과
- [ ] **M2**: 부트스트랩 + RAW 4슬롯 업로드/자동 인식 (← 진행 중)
- [ ] **M3**: 출력1·출력3 생성 + 소스빈 분리 + PG 검증
- [ ] **M4**: 출력2 + 인쇄 미리보기 + 페이지 분할
- [ ] **M5**: PG 입력 단계 + 통합 엑셀 다운로드 + Neon 7일 TTL
- [ ] **M6**: 보안 게이트 + 푸시 + Vercel 배포 검증

## 로컬 개발

```bash
# 1) 의존성 설치
npm install

# 2) 환경변수 설정
cp .env.example .env.local
# DATABASE_URL, BLOB_READ_WRITE_TOKEN, CRON_SECRET 채움

# 3) DB 마이그레이션 (Neon이 준비되면)
npm run db:migrate

# 4) 개발 서버
npm run dev
```

## 명령어
| 명령 | 용도 |
|------|------|
| `npm run dev` | 개발 서버 (Turbopack) |
| `npm run build` | 프로덕션 빌드 |
| `npm run typecheck` | TypeScript 타입체크 |
| `npm run lint` | ESLint |
| `npm test` | Vitest 단위테스트 |
| `npm run test:coverage` | 커버리지 리포트 |
| `npm run db:generate` | Drizzle 마이그레이션 생성 |
| `npm run db:migrate` | 마이그레이션 적용 |
| `npm run db:studio` | Drizzle Studio (DB 탐색) |

## 배포
- Vercel 프로젝트와 연결, `BLOB_READ_WRITE_TOKEN` · `DATABASE_URL` · `CRON_SECRET` 환경변수 설정.
- `vercel.json`의 cron이 매일 03:00 KST `/api/cron/cleanup` 실행.
- M6 보안 게이트 이전엔 Vercel Preview Protection 또는 인증 없이 내부망 사용.

## 라이선스
내부 도구. 외부 배포 금지.
