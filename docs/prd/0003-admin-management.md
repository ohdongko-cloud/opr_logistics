# PRD #0003 — 관리 페이지 (작업이력·보관파일·회원권한·접속로그)

| 항목 | 값 |
|------|----|
| 작성일 | 2026-06-11 |
| 작성자 | ohdongko |
| 상태 | v2 (게이트① 보강 후 — §10 권위) |
| 선행 | #0001(데이터), #0002(단계형 워크플로우·잡 store) |
| 관계 | 인증(M7)에 **역할(RBAC)** + **회원 DB 관리** + **감사 로그** 추가 |

---

## 1. 배경
현재 인증은 이메일 OTP + `ALLOWED_EMAILS` 환경변수 화이트리스트뿐이라, (a) 누가 언제 무엇을 했는지 추적 불가, (b) 접속자를 UI에서 제한·관리 불가, (c) 보관 중인 작업 파일을 한 곳에서 조회/다운로드 불가. 운영을 위해 **관리 페이지**가 필요하다.

## 2. 목표 / 비목표
### 2.1 목표
- **G1.** 작업(잡) 업로드/처리 이력을 표로 조회 (일자·사용자·시간·단계·만료).
- **G2.** 7일 보관 중인 작업 파일을 관리 페이지에서 **다운로드** + **남은 보관기간 표기** + **7일 후 자동삭제 강조 경고**.
- **G3.** **회원 권한 관리(RBAC)**: master / admin / user 3역할. admin만 회원 권한부여·탈퇴. master만 admin 지정.
- **G4.** **접속(로그인) 로그**를 적재하고 관리 페이지에서 조회.
- **G5.** master 관리자는 **환경변수 `MASTER_ADMIN_EMAIL`**(하드코딩 금지)로 지정. 값 예시 `oh_dongha01@eland.co.kr`.

### 2.2 비목표
- **N1.** 세분화된 권한(잡별 ACL) — 역할 3종만.
- **N2.** 회원 자가가입(self-signup) — 가입은 admin이 추가하거나 env 허용 이메일의 첫 로그인 시 자동 프로비저닝.
- **N3.** 외부 SSO/그룹 디렉터리 연동.
- **N4.** 로그 장기 보관/분석 — 로그인 로그 90일 보관 후 정리(cron 확장은 차후).
- **N5.** 잡 데이터 변환 로직 변경(#0001/#0002 유지).

## 3. 역할 모델 (RBAC)
| 역할 | 출처 | 권한 |
|------|------|------|
| **master** | `MASTER_ADMIN_EMAIL` 환경변수 1개 | admin의 모든 권한 + **admin 지정/해제** + master 보호 |
| **admin** | master가 지정 (users.role='admin') | 관리 페이지 접근, 회원 추가/탈퇴, 모든 잡 이력·다운로드, 로그 조회 |
| **user** | 첫 로그인 시 자동 프로비저닝 | 일반 워크플로우만 (관리 페이지 접근 불가) |

- **getRole(email)**: email==MASTER → 'master'; users.role 조회; 없으면 'user'.
- master는 DB role과 무관하게 항상 master (env가 진실의 원천). users 테이블에 master row가 있어도 강등 불가.

## 4. 멤버십 / 로그인 게이트 (M7 보강)
- **canLogin(email)** 로직:
  1. email == MASTER → 허용 (+ 없으면 users에 master row 자동 생성)
  2. users row 존재 & status='withdrawn' → **거부** (명시적 차단이 최우선)
  3. users row 존재 & status='active' → 허용
  4. row 없음 → `isEmailAllowed(email)`(env, 도메인/정확) 이면 허용 + **자동 프로비저닝**(role='user', status='active'); 아니면 거부
- 즉 현재 접속 가능자(@eland.co.kr 등)는 그대로 유지(비파괴), admin은 명시적 탈퇴로 차단 가능, admin이 env 밖 이메일도 미리 추가 가능.
- send-otp/verify-otp의 화이트리스트 검사를 `canLogin`으로 교체. enumeration 방지(동일 200 응답) 유지.

## 5. 요구사항
### 5.1 F1 — 회원 DB + 역할 (users 테이블)
- `users(email PK, role, status, invited_by, created_at, last_login_at)`.
- 역할 'master'|'admin'|'user', status 'active'|'withdrawn'.
- 마이그레이션 멱등·하위호환. 기존 ALLOWED_EMAILS는 seed로 import(선택).

### 5.2 F2 — 접속 로그 (login_logs 테이블)
- `login_logs(id, email, ip, user_agent, success, reason, at)`.
- **verify-otp 성공/실패 시 적재** (성공=세션 발급, 실패=코드불일치/만료/미허용). IP·UA 마스킹 정책: 전체 저장하되 화면엔 그대로(내부 운영 도구). PII 최소: user_agent는 200자 컷.
- 90일 경과 로그는 cleanup cron에서 정리(확장).

### 5.3 F3 — 권한 헬퍼 + 가드
- `getRole`, `requireAdmin()`(admin|master), `requireMaster()`.
- **페이지** `/admin`: 미인증→/login(미들웨어), 인증됐으나 비-admin→`/`(또는 403 안내).
- **API** `/api/admin/*`: 핸들러에서 `requireAdmin`/`requireMaster`로 403. (미들웨어는 인증만, 역할은 DB조회라 핸들러에서)

### 5.4 F4 — 작업 이력 + 다운로드 (관리 페이지 ①②)
- GET `/api/admin/jobs`: 잡 목록 (id, createdByEmail, createdAt, step, expiresAt, sourceFilenames, 다운로드가능여부=step==='ready'). admin only. 페이지네이션(최근 200).
- 화면: 표(일자·시간·사용자·단계·파일명·남은 보관기간·다운로드 버튼).
- **보관기간 표기**: `만료까지 N일 M시간` + expiresAt 일시.
- **강조 경고**: "업로드된 작업 파일은 **7일 후 자동 삭제**됩니다. 필요한 파일은 미리 다운로드하세요." 를 페이지 상단에 큰 배너로.
- 다운로드: admin은 **소유권 무관** 모든 ready 잡 다운로드(checkJobOwnership에 admin 우회 추가). 비-ready는 버튼 비활성.

### 5.5 F5 — 회원 관리 (관리 페이지 ③)
- GET `/api/admin/users`: 회원 목록 (email, role, status, invited_by, created_at, last_login_at). admin only.
- POST `/api/admin/users`: 회원 추가(이메일 입력 → users active row). admin only. 이메일 형식 검증.
- PATCH `/api/admin/users/[email]`:
  - status='withdrawn' (회원 탈퇴) — admin. **단 master/다른 admin은 탈퇴 불가**(admin은 user만 탈퇴; master는 누구든, 단 master 자신·env master는 보호).
  - role 변경(user↔admin) — **master only**.
- **master 보호**: env master 이메일은 어떤 PATCH로도 강등/탈퇴 불가(요청 시 403).
- 화면: 표 + 역할 드롭다운(master에게만 노출) + 탈퇴 버튼 + 회원 추가 폼.

### 5.6 F6 — 접속 로그 조회 (관리 페이지 ④)
- GET `/api/admin/login-logs`: 최근 200건 (at, email, ip, success, reason). admin only.
- 화면: 표(시간·이메일·IP·성공여부·사유).

## 6. UX (관리 페이지 `/admin`)
- 상단 네비: 사이트 헤더에 admin/master에게만 "관리" 링크 노출.
- 탭/섹션: `[작업 이력]` `[회원 관리]` `[접속 로그]`.
- 작업 이력 상단: **7일 자동삭제 경고 배너(빨강/주황)**.
- 회원 관리: master만 역할 변경 UI 노출, admin은 탈퇴/추가만.

## 7. 엣지케이스
- **E1.** master env 미설정 → master 기능 비활성 + 경고(관리 페이지에 "MASTER_ADMIN_EMAIL 미설정" 표시). 첫 admin 부재 시 아무도 관리 못함 → 안내.
- **E2.** admin이 자신을 탈퇴 시도 → 허용하되 경고(또는 차단). **차단**(자기 탈퇴 금지)으로.
- **E3.** master 이메일을 회원목록에서 탈퇴/강등 시도 → 403.
- **E4.** 탈퇴된 회원이 로그인 시도 → canLogin 거부(로그에 reason='withdrawn' 적재).
- **E5.** 비-admin이 /api/admin/* 직접 호출 → 403.
- **E6.** 비-admin이 /admin 페이지 접근 → / 리다이렉트.
- **E7.** 잡 다운로드: admin이 타인 ready 잡 다운로드 → 허용(소유권 우회). 일반 user는 자기 잡만(기존 유지).
- **E8.** 동시: master가 admin 지정과 그 admin이 회원 탈퇴 동시 → 각 PATCH 독립, 최종 상태 일관.

## 8. 성공기준 (검증 가능)
- **AC1.** getRole: env master→'master', users.role='admin'→'admin', 미등록→'user'. master는 DB와 무관히 master.
- **AC2.** canLogin: withdrawn→거부, active→허용, env허용 미등록→허용+프로비저닝, 그 외→거부 (단위테스트).
- **AC3.** 비-admin /api/admin/* → 403, 비-admin /admin → 리다이렉트 (회귀테스트).
- **AC4.** /api/admin/jobs가 모든 잡(타 소유자 포함)을 반환, 일반 /api/jobs/[id]는 소유권 유지.
- **AC5.** admin이 타인 ready 잡 다운로드 200, 일반 user는 404 유지.
- **AC6.** 회원 탈퇴(admin)→ status='withdrawn', 그 회원 로그인 거부.
- **AC7.** 역할 변경은 master만(admin이 PATCH role → 403).
- **AC8.** master 이메일 강등/탈퇴 시도 → 403 (env 보호).
- **AC9.** verify-otp 성공/실패가 login_logs에 적재되고 /api/admin/login-logs에 노출.
- **AC10.** 작업 이력 행에 만료까지 잔여기간 + 7일삭제 경고 배너 노출.
- **AC11.** lint·typecheck·기존테스트 통과 + 신규 단위테스트(getRole/canLogin/권한가드) + 마이그레이션 멱등.

## 9. 미해결 질문
| Q# | 질문 | 잠정 | 시점 |
|----|------|------|------|
| Q1 | admin도 admin 추가 가능? | 아니오 — master만 admin 지정 | 확정 |
| Q2 | 회원 추가 시 env 밖 이메일 허용? | 예 — admin이 추가하면 env 무관 active | 확정 |
| Q3 | 로그인 로그에 IP 전체 저장 vs 마스킹 | 전체 저장(내부도구), 화면 노출 | PO 확인 |
| Q4 | 탈퇴=soft(status) vs hard(삭제) | soft(status='withdrawn'), 이력 보존 | 확정 |

---

## 부록 A — 신규 스키마
```sql
CREATE TABLE IF NOT EXISTS "users" (
  "email" text PRIMARY KEY,
  "role" text NOT NULL DEFAULT 'user',          -- master|admin|user
  "status" text NOT NULL DEFAULT 'active',       -- active|withdrawn
  "invited_by" text,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "last_login_at" timestamptz
);
CREATE TABLE IF NOT EXISTS "login_logs" (
  "id" bigserial PRIMARY KEY,
  "email" text NOT NULL,
  "ip" text,
  "user_agent" text,
  "success" boolean NOT NULL,
  "reason" text,
  "at" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "login_logs_at_idx" ON "login_logs" ("at");
CREATE INDEX IF NOT EXISTS "users_role_idx" ON "users" ("role");
```

## 부록 B — 환경변수
| 변수 | 값 | 비고 |
|------|----|----|
| `MASTER_ADMIN_EMAIL` | `oh_dongha01@eland.co.kr` | **하드코딩 금지**. master 1명. 미설정 시 master 기능 비활성 |

## 부록 C — 영향 범위
- 신규: `users`/`login_logs` 테이블, `lib/auth/roles.ts`, `/admin` 페이지, `/api/admin/{jobs,users,login-logs}` 라우트.
- 변경: `lib/auth/allowlist`→`canLogin` 게이트(send-otp/verify-otp), `checkJobOwnership`에 admin 우회, verify-otp 로그 적재, 헤더에 관리 링크.
- 무변경: #0001/#0002 데이터·단계 로직.

---

## 10. v2 보강 (critique must-fix 5 + 권고 — 본 섹션이 §3~9에 우선)

### 10.1 getRole / canLogin 평가 순서 강제 (must-fix #3)
- `getRole(email)`:
  1. **최상단**: `MASTER_ADMIN_EMAIL`이 설정됐고 `norm(email) === norm(MASTER_ADMIN_EMAIL)` → **DB 접근 없이 즉시 `'master'`**. (DB row가 user/withdrawn으로 바뀌어도 강등 불가)
  2. 아니면 users row 조회: role 반환(있으면), 없으면 `'user'`.
- `MASTER_ADMIN_EMAIL` 미설정/빈문자 → **누구도 master 아님**(빈문자 우연매칭 차단: 설정값 길이>0 확인 후 비교).
- `canLogin(email)`:
  1. **env master면 즉시 허용** (+ users에 master active row 없으면 생성). withdrawn 무시.
  2. users row & status='withdrawn' → 거부.
  3. users row & status='active' → 허용.
  4. row 없음 & `isEmailAllowed(email)` → 허용 + 자동 프로비저닝(role='user'). 그 외 거부. **미허용/withdrawn은 INSERT 금지**.
- `norm` = `normalizeEmail`(trim+lowercase). **모든 비교·조회·저장에 일관 적용**.

### 10.2 email 정규화 불변식 (must-fix #4)
- `users.email`은 **항상 `normalizeEmail()` 결과로 저장**. getRole/canLogin/PATCH/POST의 조회·INSERT 키도 전부 `normalizeEmail(email)`.
- 세션 email도 verify-otp에서 normalize됨(기존). PK 대소문자 불일치로 인한 role 미스/withdrawn 우회 방지.

### 10.3 미들웨어 + 라우트별 가드 (must-fix #2)
- `middleware.ts` matcher에 **`/admin/:path*`, `/api/admin/:path*` 추가**(최소 세션 인증). 단 기존 CRON_SECRET 디버그 라우트(smtp-test/db-introspect/allowlist-check)는 **세션 미보유 curl 호출**이므로, 미들웨어가 이들에는 401을 주지 않도록 **예외 처리**: matcher는 `/api/admin/:path*`로 잡되, 미들웨어 내에서 `pathname`이 `/api/admin/(smtp-test|db-introspect|allowlist-check)`면 통과(자체 CRON_SECRET 검사에 위임). 신규 RBAC 라우트만 세션 강제.
- **모든 신규 `/api/admin/*` 핸들러는 첫 줄에서 `requireAdmin()` 또는 `requireMaster()` 호출**(미들웨어 인증 + 핸들러 역할 = 이중 방어).
- **라우트별 가드 표**:
  | 라우트 | 가드 |
  |--------|------|
  | GET /api/admin/jobs | requireAdmin |
  | GET /api/admin/users | requireAdmin |
  | POST /api/admin/users | requireAdmin |
  | PATCH /api/admin/users/[email] | requireAdmin + (body.role 존재 시 requireMaster) |
  | GET /api/admin/login-logs | requireAdmin |
  | GET /api/admin/jobs/[id]/download | requireAdmin |

### 10.4 PATCH 필드별 분리 검증 (must-fix #1)
- PATCH 핸들러: **body에 `role` 키가 있으면 `requireMaster()` 통과 필수**. `status` 변경은 `requireAdmin`. 두 권한레벨을 **각 필드 존재 여부로 독립 검증**(requireAdmin 단일 가드 금지).
- **self-축소 차단**: actor==대상 이고 변경이 자기 권한 축소(active→withdrawn 또는 admin→user)면 **거부**(E2 + self-demote).
- **env master 보호**: 대상이 env master면 actor가 master 자신이어도 role/status **어떤 PATCH도 403**.

### 10.5 부트스트랩/lockout (must-fix #5)
- `.env.example`에 **`MASTER_ADMIN_EMAIL`** 추가(주석: 하드코딩 금지, 미설정 시 master 비활성·lockout 경고).
- **부트스트랩**: 빈 DB + master env 설정 → master 첫 로그인 시 users에 master active row 자동 생성 → 즉시 /admin + admin 지정 가능.
- **lockout 복구**: master env 미설정 + admin 0명이면 env 설정 후 재배포가 유일 복구 경로(문서화).

### 10.6 권고 반영
- **checkJobOwnership**: 내부에서 직접 `getRole`로 admin|master 판정(호출부에 isAdmin 플래그 안 넘김). 일반 user는 정확-일치 유지. `createdByEmail===null` 레거시 잡도 **비-admin은 접근 불가**로 강화.
- **login_logs reason enum**: `success | wrong_code | expired | too_many_attempts | not_allowed | withdrawn`.
- **login_logs 90일 정리**: 기존 `/api/cron/cleanup`에 `DELETE FROM login_logs WHERE at < now()-interval '90 days'` 한 줄 추가(추가 인프라 0).
- **last_login_at**: verify-otp 성공 경로에서 `UPDATE users SET last_login_at=now()`.
- **seed 전략**: 0003 마이그레이션 **seed 안 함, lazy provisioning**(첫 로그인 시 row). 회원목록 초기엔 거의 빈 목록.
- **관리 링크 가시성**: admin/master에게만 헤더 노출. 단 **링크 숨김은 보안 경계 아님** — F3 가드가 실 경계.
- **로그 표 XSS**: login-logs/users 표 렌더는 React 기본 escape만(절대 dangerouslySetInnerHTML 금지).

### 10.7 추가 성공기준
- **AC12.** admin 토큰으로 `{role:"admin"}` PATCH → 403 (필드별 가드).
- **AC13.** env master를 강등/탈퇴 시도(actor=master 포함) → 403.
- **AC14.** MASTER 미설정 시 모든 requireMaster→403, 어떤 이메일도 master 아님.
- **AC15.** 빈 DB + master env → master 첫 로그인 → users master row 생성 + /admin 접근 가능 (E2E).
- **AC16.** self-withdraw / self-demote 거부.
- **AC17.** 대소문자 다른 이메일로 로그인해도 withdrawn 차단 유지(정규화).
