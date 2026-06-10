import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addUser,
  checkLoginAllowed,
  clearRolesStore,
  getRole,
  isMasterEmail,
  masterEmail,
  patchUser,
  provisionLogin,
} from "./roles";

const ORIG_MASTER = process.env.MASTER_ADMIN_EMAIL;
const ORIG_ALLOW = process.env.ALLOWED_EMAILS;

beforeEach(() => {
  clearRolesStore();
  process.env.MASTER_ADMIN_EMAIL = "boss@eland.co.kr";
  process.env.ALLOWED_EMAILS = "@eland.co.kr,extra@gmail.com";
});
afterEach(() => {
  if (ORIG_MASTER === undefined) delete process.env.MASTER_ADMIN_EMAIL;
  else process.env.MASTER_ADMIN_EMAIL = ORIG_MASTER;
  if (ORIG_ALLOW === undefined) delete process.env.ALLOWED_EMAILS;
  else process.env.ALLOWED_EMAILS = ORIG_ALLOW;
});

describe("masterEmail / isMasterEmail", () => {
  it("env 설정 시 정규화 비교", () => {
    expect(masterEmail()).toBe("boss@eland.co.kr");
    expect(isMasterEmail("BOSS@Eland.co.kr")).toBe(true);
    expect(isMasterEmail("other@eland.co.kr")).toBe(false);
  });
  it("env 미설정 시 누구도 master 아님", () => {
    delete process.env.MASTER_ADMIN_EMAIL;
    expect(masterEmail()).toBeNull();
    expect(isMasterEmail("boss@eland.co.kr")).toBe(false);
  });
  it("빈문자 env → master 아님", () => {
    process.env.MASTER_ADMIN_EMAIL = "   ";
    expect(masterEmail()).toBeNull();
    expect(isMasterEmail("")).toBe(false);
  });
});

describe("getRole (env master 우선)", () => {
  it("env master는 항상 master (DB 무관)", async () => {
    expect(await getRole("boss@eland.co.kr")).toBe("master");
    expect(await getRole("BOSS@ELAND.co.kr")).toBe("master");
  });
  it("미등록 → user", async () => {
    expect(await getRole("nobody@eland.co.kr")).toBe("user");
  });
  it("admin 지정 후 admin", async () => {
    await provisionLogin("staff@eland.co.kr"); // user row 생성
    await patchUser({
      targetEmail: "staff@eland.co.kr",
      actorEmail: "boss@eland.co.kr",
      role: "admin",
    });
    expect(await getRole("staff@eland.co.kr")).toBe("admin");
  });
});

describe("checkLoginAllowed (읽기전용, 프로비저닝 안함)", () => {
  it("env master 허용", async () => {
    expect((await checkLoginAllowed("boss@eland.co.kr")).ok).toBe(true);
  });
  it("env 허용 도메인 허용", async () => {
    expect((await checkLoginAllowed("anyone@eland.co.kr")).ok).toBe(true);
  });
  it("env 비허용 거부", async () => {
    const r = await checkLoginAllowed("rando@gmail.com");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_allowed");
  });
  it("탈퇴 회원은 env 허용이어도 거부", async () => {
    await provisionLogin("staff@eland.co.kr");
    await patchUser({
      targetEmail: "staff@eland.co.kr",
      actorEmail: "boss@eland.co.kr",
      status: "withdrawn",
    });
    const r = await checkLoginAllowed("staff@eland.co.kr");
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("withdrawn");
  });
  it("대소문자 달라도 탈퇴 차단 유지(정규화)", async () => {
    await provisionLogin("Staff2@eland.co.kr");
    await patchUser({
      targetEmail: "staff2@eland.co.kr",
      actorEmail: "boss@eland.co.kr",
      status: "withdrawn",
    });
    expect((await checkLoginAllowed("STAFF2@ELAND.co.kr")).ok).toBe(false);
  });
});

describe("patchUser 권한/보호", () => {
  it("env master 강등/탈퇴 시도 → forbidden (actor=master여도)", async () => {
    const r1 = await patchUser({
      targetEmail: "boss@eland.co.kr",
      actorEmail: "boss@eland.co.kr",
      role: "user",
    });
    expect(r1.ok).toBe(false);
    if (!r1.ok) expect(r1.error).toBe("forbidden");
    const r2 = await patchUser({
      targetEmail: "boss@eland.co.kr",
      actorEmail: "boss@eland.co.kr",
      status: "withdrawn",
    });
    expect(r2.ok).toBe(false);
  });
  it("self-reduce (자기 탈퇴) 차단", async () => {
    await provisionLogin("admin1@eland.co.kr");
    const r = await patchUser({
      targetEmail: "admin1@eland.co.kr",
      actorEmail: "admin1@eland.co.kr",
      status: "withdrawn",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("self_reduce");
  });
  it("self-demote (admin→user 자기강등) 차단", async () => {
    await provisionLogin("admin2@eland.co.kr");
    const r = await patchUser({
      targetEmail: "admin2@eland.co.kr",
      actorEmail: "admin2@eland.co.kr",
      role: "user",
    });
    expect(r.ok).toBe(false);
  });
  it("admin이 다른 admin을 탈퇴 시도 → forbidden (master만 가능, §5.5)", async () => {
    // adminA, adminB 둘 다 admin
    await provisionLogin("adminA@eland.co.kr");
    await provisionLogin("adminB@eland.co.kr");
    await patchUser({ targetEmail: "adminA@eland.co.kr", actorEmail: "boss@eland.co.kr", role: "admin" });
    await patchUser({ targetEmail: "adminB@eland.co.kr", actorEmail: "boss@eland.co.kr", role: "admin" });
    // adminA가 adminB 탈퇴 시도
    const r = await patchUser({
      targetEmail: "adminB@eland.co.kr",
      actorEmail: "adminA@eland.co.kr",
      status: "withdrawn",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe("forbidden");
  });

  it("master는 admin 탈퇴 가능", async () => {
    await provisionLogin("adminC@eland.co.kr");
    await patchUser({ targetEmail: "adminC@eland.co.kr", actorEmail: "boss@eland.co.kr", role: "admin" });
    const r = await patchUser({
      targetEmail: "adminC@eland.co.kr",
      actorEmail: "boss@eland.co.kr",
      status: "withdrawn",
    });
    expect(r.ok).toBe(true);
  });

  it("정상: master가 타 user를 admin 지정", async () => {
    await provisionLogin("staff3@eland.co.kr");
    const r = await patchUser({
      targetEmail: "staff3@eland.co.kr",
      actorEmail: "boss@eland.co.kr",
      role: "admin",
    });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.user.role).toBe("admin");
  });
});

describe("addUser", () => {
  it("env 밖 이메일도 추가 가능 → 이후 로그인 허용", async () => {
    const r = await addUser("outsider@other.com", "boss@eland.co.kr");
    expect(r.ok).toBe(true);
    expect((await checkLoginAllowed("outsider@other.com")).ok).toBe(true);
  });
  it("잘못된 이메일 거부", async () => {
    const r = await addUser("not-an-email", "boss@eland.co.kr");
    expect(r.ok).toBe(false);
  });
});
