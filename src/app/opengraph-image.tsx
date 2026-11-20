import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { site } from "@/lib/site";

/**
 * The picture shown when someone shares a PROXIMA link (Facebook, WhatsApp,
 * X, Discord, …). It's drawn once at build time, so it costs nothing per visit.
 */
export const alt = `${site.name}: ${site.tagline}. Think brighter. Build faster.`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const fontDir = join(process.cwd(), "src/assets/og-fonts");
  const [black, medium] = await Promise.all([
    readFile(join(fontDir, "montserrat-latin-900-normal.woff")),
    readFile(join(fontDir, "montserrat-latin-500-normal.woff")),
  ]);

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "radial-gradient(circle at 50% 45%, #1c1c1c 0%, #050505 62%)",
        color: "#f8fafc",
        fontFamily: "Montserrat",
        position: "relative",
      }}
    >
      {/* Orbit rings */}
      <div
        style={{
          position: "absolute",
          width: 760,
          height: 760,
          borderRadius: 9999,
          border: "1px solid rgba(255,255,255,0.08)",
          display: "flex",
        }}
      />
      <div
        style={{
          position: "absolute",
          width: 1080,
          height: 1080,
          borderRadius: 9999,
          border: "1px solid rgba(255,255,255,0.05)",
          display: "flex",
        }}
      />

      {/* Logo */}
      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
        <svg width="64" height="64" viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="13" fill="#ffffff" />
          <ellipse
            cx="32"
            cy="32"
            rx="24"
            ry="8"
            fill="none"
            stroke="#ffffff"
            strokeWidth="3"
            transform="rotate(-20 32 32)"
          />
        </svg>
        <div style={{ fontSize: 40, fontWeight: 900, letterSpacing: 12 }}>{site.name}</div>
      </div>

      <div
        style={{
          marginTop: 44,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          fontSize: 104,
          fontWeight: 900,
          lineHeight: 1,
          letterSpacing: -4,
          textShadow: "0 0 40px rgba(255,255,255,0.35)",
        }}
      >
        <div>Think brighter.</div>
        <div style={{ marginTop: 8 }}>Build faster.</div>
      </div>

      <div style={{ marginTop: 40, fontSize: 30, fontWeight: 500, color: "rgba(248,250,252,0.68)" }}>
        AI for coding, learning, writing and ideas
      </div>

      <div
        style={{
          marginTop: 40,
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 24px",
          borderRadius: 9999,
          border: "1px solid rgba(255,255,255,0.14)",
          background: "rgba(255,255,255,0.05)",
          fontSize: 20,
          fontWeight: 500,
          letterSpacing: 5,
          color: "rgba(248,250,252,0.7)",
        }}
      >
        <div style={{ width: 12, height: 12, borderRadius: 9999, background: "#10b981", display: "flex" }} />
        {`${site.version} · BY ${site.developer.toUpperCase()}`}
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Montserrat", data: black, weight: 900, style: "normal" },
        { name: "Montserrat", data: medium, weight: 500, style: "normal" },
      ],
    },
  );
}
