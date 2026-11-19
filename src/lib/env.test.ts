import { describe, expect, it } from "vitest";
import { checkEnv } from "./env";

const valid = {
  DATABASE_URL: "postgresql://u:p@ep-x-pooler.ap-southeast-1.aws.neon.tech/neondb?sslmode=require",
  DIRECT_URL: "postgresql://u:p@ep-x.ap-southeast-1.aws.neon.tech/neondb?sslmode=require",
  AUTH_SECRET: "a".repeat(44),
  AUTH_GOOGLE_ID: "123-abc.apps.googleusercontent.com",
  AUTH_GOOGLE_SECRET: "GOCSPX-abcdefghijkl",
};

describe("checkEnv", () => {
  it("accepts a complete setup", () => {
    expect(checkEnv(valid).ok).toBe(true);
  });

  it("lists every missing value in plain words", () => {
    const result = checkEnv({});
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems).toEqual(
        expect.arrayContaining([
          "DATABASE_URL is missing",
          "AUTH_SECRET is missing",
          "AUTH_GOOGLE_ID is missing",
          "AUTH_GOOGLE_SECRET is missing",
        ]),
      );
    }
  });

  it("treats empty values as missing and catches wrong formats", () => {
    const result = checkEnv({ ...valid, AUTH_SECRET: "", DATABASE_URL: "mysql://nope" });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.problems.join("\n")).toMatch(/AUTH_SECRET is missing/);
      expect(result.problems.join("\n")).toMatch(/DATABASE_URL must start with postgresql/);
    }
  });
});
