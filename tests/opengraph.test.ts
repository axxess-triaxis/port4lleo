import { describe, expect, it, vi } from "vitest";

// The portfolio loader is server-only and reads Supabase; the image only needs its result.
const portfolio = vi.hoisted(() => ({ value: null as unknown }));
vi.mock("@/lib/portfolio", () => ({ getPortfolioByLogin: async () => portfolio.value }));

const { default: Image } = await import("@/app/u/[username]/opengraph-image");

async function render(username: string) {
  const res = await Image({ params: Promise.resolve({ username }) });
  // ImageResponse renders lazily: layout errors surface when the body is read.
  return new Uint8Array(await res.arrayBuffer());
}

const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47];

describe("portfolio Open Graph image", () => {
  it("renders a PNG for an existing portfolio", async () => {
    portfolio.value = {
      metrics: { profile: { name: "Sudipta Koushik Sarmah", login: "axxess-triaxis" } },
      score: { score: 702, tier: "Architect" },
    };
    const png = await render("axxess-triaxis");
    expect([...png.slice(0, 4)]).toEqual(PNG_MAGIC);
  });

  it("renders a PNG for an unknown user", async () => {
    portfolio.value = null;
    const png = await render("nobody-here");
    expect([...png.slice(0, 4)]).toEqual(PNG_MAGIC);
  });
});
