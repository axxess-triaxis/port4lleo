import { ImageResponse } from "next/og";
import { getPortfolioByLogin } from "@/lib/portfolio";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Builder portfolio";

export default async function Image({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const p = await getPortfolioByLogin(username);
  const name = p ? (p.metrics.profile.name ?? p.metrics.profile.login) : username;
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "#fcfcfb",
          color: "#0b0b0b",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", fontSize: 32, color: "#52514e" }}>BuilderScore</div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 64, fontWeight: 700 }}>{name}</div>
          <div style={{ fontSize: 32, color: "#52514e" }}>@{p?.metrics.profile.login ?? username}</div>
        </div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
          <div style={{ fontSize: 140, fontWeight: 700, color: "#1c5cab" }}>{p ? p.score.score : "—"}</div>
          <div style={{ fontSize: 40, color: "#52514e" }}>{p ? `/ 1000 · ${p.score.tier}` : "not found"}</div>
        </div>
      </div>
    ),
    size,
  );
}
