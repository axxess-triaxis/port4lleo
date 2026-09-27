import { badgeSvg } from "@/lib/badge";
import { getPortfolioByLogin } from "@/lib/portfolio";

/** GET /api/badge/<login> -- README badge: ![Builder Score](https://<host>/api/badge/<login>) */
export async function GET(_req: Request, { params }: RouteContext<"/api/badge/[username]">) {
  const { username } = await params;
  const p = await getPortfolioByLogin(username).catch(() => null);
  const value = p ? `${p.score.score} · ${p.score.tier}` : "not found";
  return new Response(badgeSvg("builder score", value), {
    status: p ? 200 : 404,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
