# PRD #0004 — 비밀번호 로그인 (최초만 OTP, 이후 비밀번호)

## 1. 배경
현재(#0001 M7, #0003)는 **매 로그인마다 이메일 OTP**를 받는다. 사용자가 로그인할 때마다 메일함을 열어 6자리 코드를 입력해야 해 번거롭다. 요청: **최초 로그인/가입 때만 OTP로 본인(이메일) 확인**하고, 그 시점에 사용자가 **비밀번호를 설정**한 뒤, **이후 로그인은 이메일 + 비밀번호**로 한다. 분실 시에만 다시 OTP로 재설정한다.

기존 인프라 재사용:
- `email_otps`(OTP 발급·검증), `sessions`/jose JWT 세션 쿠키, `users`(회원/역할), `login_logs`(접속로그), `rate-limit.ts`, `checkLoginAllowed`(withdrawn/미허용 차단).
- 신규: `users.password_hash`(scrypt) + `/api/auth/login` + `/api/auth/set-password` + `/set-password` 페이지.

## 2. 목표 / 비목표
**목표**
- G1. 비밀번호가 설정된 회원은 **이메일+비밀번호** 1스텝 로그인(OTP 불필요).
- G2. 최초 로그인/가입은 OTP 인증 → **비밀번호 설정**으로 완료.
- G3. 비밀번호 분실 시 **OTP 재인증 → 새 비밀번호 설정**으로 복구.
- G4. 기존 OTP 사용자(비번 없음)는 **다음 로그인 시 OTP 인증 후 비밀번호 설정을 강제**(1회).
- G5. 비밀번호는 **scrypt 해시**로만 저장(평문 저장·로그 금지), **timing-safe** 비교.

**비목표**
- N1. 소셜/SSO 로그인. (별도)
- N2. 2FA(OTP+비번 동시). 최초/분실 외 상시 OTP는 폐지(요청대로).
- N3. 로그인 상태에서 "현재 비밀번호 입력 후 변경" 자체 UI는 본 PRD 핵심 아님 — **분실(OTP) 재설정**으로 대체. (향후 `미해결 Q3` 참조)
- N4. 비밀번호 만료/회전 정책, 비밀번호 히스토리.
- N5. **비밀번호 재설정 시 기존 세션 강제 만료**(전 기기 로그아웃). 세션이 스테이트리스 JWT(24h)라 즉시 revoke 불가 — 본 PRD 비목표. (한계: 분실 재설정 후에도 기존 발급 세션은 만료(24h)까지 유효. 향후 세션 버전/회전 또는 `sessions` 테이블 기반 revocation으로 보강. `미해결 Q4`)

## 3. 사용자 시나리오
1. **신규/최초**: `/login`에서 "처음이신가요? 이메일 인증" → 이메일 입력 → OTP 발송 → 코드 입력(검증) → **비밀번호 설정 화면** → 8자+ 입력·확인 → 저장되면 로그인 완료(`/`).
2. **재방문(비번 보유)**: `/login`에서 이메일+비밀번호 입력 → 로그인 완료. (OTP 없음)
3. **비밀번호 분실**: `/login`에서 "비밀번호를 잊으셨나요?" → 이메일 입력 → OTP → 검증 → **새 비밀번호 설정** → 로그인 완료.
4. **기존 사용자 전환**: 비번 없는 기존 회원이 `/login`에서 비밀번호로 로그인 시도 → 실패(통일 메시지). "처음/분실" 경로로 OTP 인증 → 비밀번호 설정 강제 → 이후 비번 로그인. (또는 OTP 검증 직후 `needsPasswordSetup`로 자동 유도)

## 4. 요구사항

### F1 — 스키마: 비밀번호 저장
- **F1.1** `users.password_hash text`(NULL 허용) 추가. 값은 self-describing 인코딩 `scrypt$N$r$p$saltB64$hashB64`. NULL = 비번 미설정.
- **F1.2** `users.password_set_at timestamptz`(NULL 허용) 추가(감사용, 마지막 설정 시각).
- **F1.3** 마이그레이션 `0004`는 **멱등·하위호환**(`ADD COLUMN IF NOT EXISTS`, NULL 기본). 인메모리 폴백(`MemUser`)에도 `passwordHash`/`passwordSetAt` 필드 추가.

### F2 — 비밀번호 해싱/정책 (`src/lib/auth/password.ts`)
- **F2.1** `hashPassword(plain)`: 16바이트 랜덤 salt + Node `crypto.scrypt`(N=16384, r=8, p=1, keylen=64) → `scrypt$16384$8$1$<saltB64>$<hashB64>` 반환.
- **F2.2** `verifyPassword(plain, encoded)`: 인코딩 파싱 → 동일 파라미터로 파생 → `crypto.timingSafeEqual` 비교. 파싱 실패/형식 불일치 → false(throw 금지).
- **F2.3** `validatePasswordPolicy(plain)`: **최소 8자**(상한 200자), 전부 공백 금지. 통과/실패 사유 반환. (복잡도 규칙 없음 — 결정사항)
- **F2.4** 평문 비밀번호는 **어디에도 로그/응답에 남기지 않는다**.

### F3 — 로그인 API `POST /api/auth/login`
- 입력: `{ email, password }`(zod, email≤200, password 1~200).
- **F3.1 레이트리밋**: `login:ip:<ip>`(예: 10/분) **및** `login:email:<email>`(예: 5/15분) 동시 적용 → 초과 시 429(+retry-after). (`rate-limit.ts` 재사용, 프리셋 `LOGIN_IP_LIMIT`/`LOGIN_EMAIL_LIMIT`)
- **F3.2** `checkLoginAllowed(email)` 선검사(withdrawn/미허용 차단).
- **F3.3** 회원 조회 → `password_hash` 없으면(미설정) **통일 실패**. 있으면 `verifyPassword`로 검증.
- **F3.4 성공**: `provisionLogin`(멱등) + `touchLastLogin` + `recordLogin(success)` + 세션 쿠키 발급 + `{ ok:true, email }`.
- **F3.5 실패**: 사유별 `recordLogin`(`wrong_password`/`no_password`/`not_allowed`/`withdrawn`) 적재하되, **클라이언트엔 통일 401 `invalid_credentials`**(enumeration 방지: 미가입/미설정/오답 동일 메시지). 레이트리밋만 429.

### F4 — OTP 검증 변경 `POST /api/auth/verify-otp`
- **F4.1** 성공 응답에 `needsPasswordSetup: boolean`(= 해당 회원 `password_hash` NULL 여부) 추가. 세션은 기존대로 발급.
- **F4.2** 그 외 동작(통일 응답·로그·프로비저닝)은 유지.

### F5 — 비밀번호 설정 API `POST /api/auth/set-password`
- **F5.1** **세션 필수**(`getCurrentEmail`). 비세션 → 401. (OTP 검증 직후 발급된 세션 또는 로그인 세션이 본인 증명.)
- **F5.2** 입력: `{ password, confirm }`. `password===confirm` 및 `validatePasswordPolicy` 통과 필수. 위반 → 400(`weak_password`/`mismatch`).
- **F5.3** `hashPassword` → `users.password_hash`+`password_set_at` 갱신(해당 세션 이메일에 한해). `recordLogin(success, reason='password_set')` 또는 별도 표기.
- **F5.4 레이트리밋**: `setpw:ip:<ip>`(예: 10/분).
- **F5.5** 최초설정/분실재설정/전환 모두 이 엔드포인트로 처리(직전 OTP 검증이 본인 증명이므로 **기존 비밀번호 입력 불요**).

### F6 — 비밀번호 미설정 사용자 강제 유도(전환 강제)
- **F6.1** 인증된 사용자가 `password_hash` NULL이면, 보호 페이지 접근 시 **`/set-password`로 리다이렉트**(설정 완료 전까지). 적용 위치: 보호 라우트 서버 컴포넌트(홈 `/`, `/jobs/[id]`, `/admin`)에서 `getCurrentEmail()` + `hasPassword(email)` 확인. (미들웨어 DB 조회는 비용↑ → 페이지 레벨 가드 채택)
- **F6.2** `/set-password` 페이지·`/api/auth/*`·로그아웃은 리다이렉트 예외.
- **F6.3** OTP 검증 직후 클라이언트는 `needsPasswordSetup===true`면 `/set-password`로 이동, 아니면 `/`.

### F7 — UI
- **F7.1 `/login`(변경)**: **이메일+비밀번호** 폼 → `/api/auth/login`. 하단 링크: "처음이신가요? 이메일 인증으로 시작" → `/login/verify?mode=signup`, "비밀번호를 잊으셨나요?" → `/login/verify?mode=reset`. 실패 시 통일 메시지("이메일 또는 비밀번호가 올바르지 않습니다").
- **F7.2 `/login/verify`(변경)**: 기존 OTP 화면 유지. 검증 성공 후 `needsPasswordSetup` 또는 `mode=reset`이면 `/set-password`로, 아니면 `/`로 이동.
- **F7.3 `/set-password`(신규)**: 로그인 세션 필요. 새 비밀번호+확인 입력 → `/api/auth/set-password` → 성공 시 `/`. 정책(8자+) 안내·검증.

### F8 — 로그/관리
- **F8.1** `LoginReason`에 `wrong_password`, `no_password`, `password_set` 추가. `login_logs.reason` 주석 갱신.
- **F8.2** 관리 페이지 접속 로그(`/admin`)에 신규 사유가 그대로 표기(추가 UI 불요).

## 5. 보안 (게이트② 매핑)
- **S1** 비밀번호 **scrypt 해시 저장**, 평문 비저장/비로그(F2.4). timing-safe 비교(F2.2).
- **S2** **enumeration 방지**: 로그인 실패는 미가입/미설정/오답 **동일 401**(F3.5). OTP 발송은 기존대로 동일 200+더미지연.
- **S3** **브루트포스 완화**: 로그인 IP+이메일 레이트리밋(F3.1), set-password 레이트리밋(F5.4).
- **S4** set-password는 **세션(=본인 증명) 필수**(F5.1), 타인 비번 변경 불가(세션 이메일에만 적용).
- **S5** 입력 검증(zod), 통일 에러, 내부 메시지 비노출. 세션 쿠키 기존 속성 유지(HttpOnly/SameSite=lax/Secure(prod)/24h).
- **S6** 신규 env 없음(SESSION_SECRET/OTP_PEPPER 등 기존 재사용). scrypt는 Node 내장 — 의존성 추가 없음.

## 6. 엣지케이스
- E1. 비번 보유자가 "처음/분실"로 OTP 인증 → set-password로 **덮어쓰기**(정상, 분실 복구).
- E2. OTP 검증 성공했으나 set-password 미완료로 이탈 → 다음 보호페이지 접근 시 다시 `/set-password` 강제(F6.1).
- E3. withdrawn 회원: 로그인/ OTP 모두 통일 차단(checkLoginAllowed).
- E4. env master(`MASTER_ADMIN_EMAIL`): DB행 없을 수 있음 → 최초 비번 로그인 전엔 OTP 경로로 진입해 set-password(자기 행 upsert). `provisionLogin`이 master 행 생성.
- E5. 동시 다중 set-password 요청 → 마지막 쓰기 승리(허용).
- E6. 비밀번호 정책 미달/확인 불일치 → 400 + 화면 안내, 세션 유지.

## 7. 성공 기준 (검증 가능)
- AC1. 비번 설정 회원이 이메일+비번으로 `/api/auth/login` → 200 + 세션, OTP 없이 `/` 진입.
- AC2. 비번 미설정/오답/미가입 로그인 → **모두 401 `invalid_credentials`**(동일 본문).
- AC3. 신규 사용자: OTP 검증 → `needsPasswordSetup:true` → `/set-password` → 8자+ 저장 → 이후 비번 로그인 성공.
- AC4. 분실: `mode=reset` OTP 검증 → set-password로 새 비번 → 새 비번 로그인 성공, 옛 비번 실패.
- AC5. 기존(비번없음) 사용자가 세션 보유 상태로 보호페이지 접근 → `/set-password`로 리다이렉트(F6.1), 설정 후 정상 접근.
- AC6. `hashPassword`→`verifyPassword` 라운드트립 단위테스트 통과, 오답 false, 형식깨짐 false(no throw).
- AC7. `validatePasswordPolicy`: 7자 거부, 8자 통과, 공백전용 거부.
- AC8. 로그인 IP/이메일 레이트리밋 초과 시 429(+retry-after).
- AC9. `login_logs`에 `wrong_password`/`no_password`/`password_set` 사유 적재 확인.
- AC10. gitleaks 0, 평문 비밀번호가 로그/응답/DB에 없음(코드 검토).
- AC11. **전체 단위테스트·`next build`·ESLint 통과**(게이트). password 라운드트립·정책·로그인 핸들러 테스트 추가.

## 7.1 의존성 / 운영 전제
- D1. **신규 env 없음** — `SESSION_SECRET`/`OTP_PEPPER`/SMTP/`DATABASE_URL` 등 기존 재사용. scrypt는 Node 내장(의존성 추가 0).
- D2. **운영 전제**: 마이그레이션 `0004`(users.password_hash/password_set_at)를 프로덕션 DB에 적용해야 비번 로그인/설정이 동작. 미적용 시 set-password가 컬럼 부재로 실패 → `npm run db:migrate` 또는 부록 A SQL 멱등 적용.
- D3. 선행: #0003(users/login_logs) 적용 완료 상태 전제.

## 8. 미해결 질문
- Q1. (결정됨) 분실 재설정 = **OTP**. 정책 = **최소 8자**. 기존전환 = **다음 로그인 시 강제**.
- Q2. 로그인 이메일 레이트리밋 임계값(예: 5회/15분) 운영 적정값 — 기본값으로 시작, 필요시 조정.
- Q3. 로그인 상태에서 "현재 비번 입력 후 변경" UI는 본 PRD 비목표. 필요 시 후속 PRD에서 `/set-password`에 현재비번 확인 추가.
- Q4. 비밀번호 재설정 시 기존 세션 강제 만료(전 기기 로그아웃)는 비목표(N5). 향후 세션 버전/회전으로 보강 검토.

## 부록 A — 스키마 변경(마이그레이션 0004, 멱등)
```sql
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_hash" text;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_set_at" timestamp with time zone;
```

## 부록 B — 인증 흐름(상태)
```
[/login] --(email+password)--> POST /api/auth/login
    ├─ 성공 → 세션 → /
    └─ 실패(통일 401)

[/login → "처음/분실"] --(email)--> send-otp --(code)--> verify-otp
    └─ 성공 → 세션 + needsPasswordSetup? → /set-password --(pw)--> set-password → /

[보호페이지] 인증 && !hasPassword → /set-password (강제, F6)
```

## 부록 C — 영향 파일
- 신규: `src/lib/auth/password.ts`, `src/app/api/auth/login/route.ts`, `src/app/api/auth/set-password/route.ts`, `src/app/set-password/page.tsx`, `src/components/auth/*`(폼), `drizzle/0004_*.sql`.
- 변경: `src/db/schema.ts`(users 컬럼), `src/lib/auth/roles.ts`(LoginReason, findUser에 passwordHash, `setPassword`, `hasPassword`, MemUser), `src/app/api/auth/verify-otp/route.ts`(needsPasswordSetup), `src/app/login/page.tsx`(+verify), 보호페이지 가드(`/`,`/jobs/[id]`,`/admin`), `rate-limit.ts`(프리셋).
