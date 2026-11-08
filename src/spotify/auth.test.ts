// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from "vitest";
import { clearClientId, getClientId, setClientId } from "./auth";

const ID = "0123456789abcdef0123456789abcdef";

describe("client id", () => {
  beforeEach(() => localStorage.clear());

  it("stores a trimmed client id", () => {
    setClientId(`  ${ID}  \n`);
    expect(getClientId()).toBe(ID);
  });
  it("rejects ids that are not 32 hex chars", () => {
    expect(() => setClientId("hello")).toThrow();
  });
  it("clearClientId removes the stored id and the token", () => {
    setClientId(ID);
    localStorage.setItem("sm.token", "{}");
    clearClientId();
    expect(localStorage.getItem("sm.clientId")).toBeNull();
    expect(localStorage.getItem("sm.token")).toBeNull();
  });
});
