import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PortfolioView } from "@/components/PortfolioView";
import { getPortfolioByLogin } from "@/lib/portfolio";

export async function generateMetadata({ params }: PageProps<"/u/[username]">): Promise<Metadata> {
  const { username } = await params;
  const p = await getPortfolioByLogin(username);
  if (!p) return { title: "Not found" };
  const name = p.metrics.profile.name ?? p.metrics.profile.login;
  return {
    title: `${name} (${p.score.score})`,
    description: `${name}'s builder portfolio: Builder Score ${p.score.score} (${p.score.tier}).`,
  };
}

export default async function UserPortfolioPage({ params }: PageProps<"/u/[username]">) {
  const { username } = await params;
  const p = await getPortfolioByLogin(username);
  if (!p) notFound();
  return <PortfolioView p={p} />;
}
