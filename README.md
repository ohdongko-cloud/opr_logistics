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

## 진행 단계
- [x] **M1**: PRD 작성 + 리뷰 게이트 통과
- [x] **M2**: 부트스트랩 + RAW 4슬롯 업로드/자동 인식
- [x] **M3**: 출력1·출력3 생성 + 소스빈 분리 + PG 검증
- [x] **M4**: 출력2 + 인쇄 미리보기 + 페이지 분할
- [x] **M5**: PG 입력 단계 + 통합 엑셀 다운로드 + Neon 7일 TTL
- [x] **M6**: 보안 게이트 + 푸시 + Vercel 배포 검증
- [x] **M7**: 이메일 OTP 로그인 (Gmail SMTP)
- [x] **M8**: Neon 실연결 + Vercel Blob + 인메모리 폴백
- [ ] **M9**: 최종 보안 게이트 + 안정화

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

## 배포 (Vercel)

### 1. 환경변수 설정 (Settings → Environment Variables)
| 카테고리 | 변수 | 비고 |
|----------|------|------|
| Neon | `DATABASE_URL` (pooled) / `DATABASE_URL_UNPOOLED` (direct) | Neon "Connection details" |
| Blob | `BLOB_READ_WRITE_TOKEN` · `BLOB_STORE_ID` · `BLOB_WEBHOOK_PUBLIC_KEY` | Blob 스토어 Connect Project 시 자동 |
| Auth | `SESSION_SECRET` · `OTP_PEPPER` · `ALLOWED_EMAILS` | 노드 randomBytes(32).hex |
| SMTP | `SMTP_HOST=smtp.gmail.com` · `SMTP_PORT=587` · `SMTP_USER` · `SMTP_PASS` · `SMTP_FROM` | Gmail 앱 비밀번호 |
| Cron | `CRON_SECRET` | `/api/cron/cleanup` Bearer |

### 2. DB 마이그레이션 (1회)
```bash
vercel link            # 프로젝트 연결
vercel env pull .env.local
npm run db:migrate     # drizzle 멱등 SQL 실행 (plants/jobs/cleanup_log/email_otps/sessions)
npm run db:seed        # 강서점 1행 시드
```

### 3. cron
`vercel.json`에 매일 18:00 UTC (=03:00 KST) `/api/cron/cleanup` 등록됨. Vercel Pro 이상에서 작동.

### 폴백 동작
- `DATABASE_URL*` 미설정 → 잡 store 인메모리, 재배포 시 휘발
- `BLOB_READ_WRITE_TOKEN` 미설정 → RAW/결과 인메모리, 재배포 시 휘발
- 둘 다 설정 → Neon + Blob 영속화 (운영 모드)

## 라이선스
내부 도구. 외부 배포 금지.
