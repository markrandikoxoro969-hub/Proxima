import { describe, expect, it } from "vitest";
import { cleanEnv, cleanEnvValue } from "./env-clean";

describe("cleanEnvValue", () => {
  it("removes quotes, spaces, a pasted KEY= and chat backslashes", () => {
    expect(cleanEnvValue('  "GOCSPX-abc"  ')).toBe("GOCSPX-abc");
    expect(cleanEnvValue("'GOCSPX-abc'")).toBe("GOCSPX-abc");
    expect(cleanEnvValue('AUTH_GOOGLE_SECRET="GOCSPX-a\\_b"', "AUTH_GOOGLE_SECRET")).toBe("GOCSPX-a_b");
    expect(cleanEnvValue('""x""')).toBe("x");
  });

  it("fixes an HTML-escaped & only in connection strings", () => {
    const url = "postgresql://u:p@h/db?sslmode=require&amp;channel_binding=require";
    expect(cleanEnvValue(url, "DATABASE_URL")).toBe(
      "postgresql://u:p@h/db?sslmode=require&channel_binding=require",
    );
    expect(cleanEnvValue("a&amp;b", "AUTH_SECRET")).toBe("a&amp;b");
  });

  it("leaves good values (including base64 secrets) untouched", () => {
    const secret = "mlhVwDPxqzjvObflWEn5bzIw+VX8pAhlsfEGBrkR/38=";
    expect(cleanEnvValue(secret, "AUTH_SECRET")).toBe(secret);
    expect(cleanEnvValue(undefined)).toBeUndefined();
  });
});

describe("cleanEnv", () => {
  it("fixes known keys in place and reports which ones changed", () => {
    const env: Record<string, string | undefined> = {
      AUTH_GOOGLE_SECRET: '"GOCSPX-x"',
      AUTH_GOOGLE_ID: "1.apps.googleusercontent.com",
      OTHER: '"kept"',
    };
    expect(cleanEnv(env)).toEqual(["AUTH_GOOGLE_SECRET"]);
    expect(env).toEqual({
      AUTH_GOOGLE_SECRET: "GOCSPX-x",
      AUTH_GOOGLE_ID: "1.apps.googleusercontent.com",
      OTHER: '"kept"',
    });
  });
});
