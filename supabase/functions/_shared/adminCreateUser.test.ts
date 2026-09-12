import { describe, it, expect } from "vitest";
import { inviteRedirect, validateChangeEmailInput, validateCreateUserInput } from "./adminCreateUser";

const ID = "0f6a2c2e-6d7b-4d0e-9a4b-1c2d3e4f5a6b";
const OTHER = "1f6a2c2e-6d7b-4d0e-9a4b-1c2d3e4f5a6b";

describe("validateCreateUserInput", () => {
  it("accepts trial and exempt invites, normalising the fields", () => {
    expect(validateCreateUserInput({ email: " Ana@X.com ", fullName: " Ana ", mode: "trial" })).toEqual({
      ok: true, input: { email: "ana@x.com", fullName: "Ana", mode: "trial" },
    });
    expect(validateCreateUserInput({ email: "a@x.com", fullName: "Ana", mode: "exempt" })).toMatchObject({ ok: true });
  });

  it("refuses bad bodies", () => {
    expect(validateCreateUserInput(null)).toEqual({ ok: false, error: "invalid_body" });
    expect(validateCreateUserInput({ email: "nope", fullName: "Ana", mode: "trial" })).toEqual({ ok: false, error: "invalid_email" });
    expect(validateCreateUserInput({ email: "a@x.com", fullName: "A", mode: "trial" })).toEqual({ ok: false, error: "invalid_name" });
    expect(validateCreateUserInput({ email: "a@x.com", fullName: "x".repeat(121), mode: "trial" })).toEqual({ ok: false, error: "invalid_name" });
    expect(validateCreateUserInput({ email: "a@x.com", fullName: "Ana", mode: "subscriber" })).toEqual({ ok: false, error: "invalid_mode" });
  });
});

describe("inviteRedirect", () => {
  it("lands on the reset page in create mode, without double slashes", () => {
    expect(inviteRedirect("https://app.test/")).toBe("https://app.test/redefinir-senha?convite=1");
    expect(inviteRedirect("http://localhost:8080")).toBe("http://localhost:8080/redefinir-senha?convite=1");
  });
});

describe("validateChangeEmailInput", () => {
  it("accepts a uuid and a valid e-mail for another user", () => {
    expect(validateChangeEmailInput({ userId: ID.toUpperCase(), email: " New@X.com " }, OTHER)).toEqual({
      ok: true, input: { userId: ID, email: "new@x.com" },
    });
  });

  it("refuses bad ids, self changes and bad e-mails", () => {
    expect(validateChangeEmailInput(null, OTHER)).toEqual({ ok: false, error: "invalid_body" });
    expect(validateChangeEmailInput({ userId: "x", email: "a@x.com" }, OTHER)).toEqual({ ok: false, error: "invalid_body" });
    expect(validateChangeEmailInput({ userId: ID, email: "a@x.com" }, ID)).toEqual({ ok: false, error: "cannot_change_self" });
    expect(validateChangeEmailInput({ userId: ID, email: "nope" }, OTHER)).toEqual({ ok: false, error: "invalid_email" });
  });
});
