import { describe, it, expect } from "vitest";
import { useAuth } from "./useAuth";
import { useAuthContext } from "@/contexts/AuthContext";

describe("useAuth", () => {
  it("re-exports useAuthContext from AuthContext", () => {
    expect(useAuth).toBe(useAuthContext);
  });
});
