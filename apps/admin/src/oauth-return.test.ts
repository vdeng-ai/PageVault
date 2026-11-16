import { describe, expect, it } from "vitest";
import { oauthReturnPath } from "./oauth-return.js";

describe("OAuth login return", () => {
  it("resumes only the local authorization endpoint", () => {
    expect(
      oauthReturnPath(
        `?oauthReturnTo=${encodeURIComponent("/oauth/authorize?state=abc&client_id=x")}`,
        "https://admin.example.com",
      ),
    ).toBe("/oauth/authorize?state=abc&client_id=x");
  });
  it.each([
    "https://evil.example",
    "//evil.example/oauth/authorize",
    "/api/admin/gc",
    "/oauth/authorize?x=1#bad",
    "/oauth/authorize/../other?x=1",
  ])("rejects %s", (path) => {
    expect(
      oauthReturnPath(
        `?oauthReturnTo=${encodeURIComponent(path)}`,
        "https://admin.example.com",
      ),
    ).toBeNull();
  });
});
