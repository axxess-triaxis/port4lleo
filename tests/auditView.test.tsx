import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AuditView } from "@/components/AuditView";
import { summarize } from "@/lib/governance/audit";
import type { AuditReport } from "@/lib/governance/types";

const report = (over: Partial<AuditReport>): AuditReport => ({
  schemaVersion: 1,
  account: "acme",
  startedAt: "2026-10-03T18:45:00Z",
  finishedAt: "2026-10-03T18:45:05Z",
  limits: { maxRepos: 25, commitLookback: 10, maxPiiFiles: 40 },
  reposInInstallation: 0,
  repos: [],
  sprawl: { totalActiveRepos: 0, overThreshold: false, nearDuplicates: [], error: null },
  ...over,
});

const render = (r: AuditReport) =>
  renderToStaticMarkup(<AuditView report={r} summary={summarize(r)} at={r.finishedAt} manageUrl="https://github.com/settings/installations/1" />);

describe("AuditView", () => {
  it("never shows zero-finding tiles for an audit that scanned nothing (live bug, 2026-10-03)", () => {
    const html = render(report({ reposInInstallation: 0 }));
    expect(html).toContain("Nothing was scanned");
    expect(html).toContain("no repository access");
    expect(html).toContain("https://github.com/settings/installations/1");
    expect(html).not.toContain("gov-critical");
  });

  it("explains when repos exist but none are visible to this viewer", () => {
    const html = render(report({ reposInInstallation: 4 }));
    expect(html).toContain("Nothing was scanned");
    expect(html).toContain("None of the 4 repositories");
    expect(html).not.toContain("Choose repositories on GitHub");
  });

  it("shows the findings tiles when at least one repo was audited", () => {
    const repo = {
      repo: "acme/web",
      url: "https://github.com/acme/web",
      private: false,
      dependabot: { findings: [], disabled: false, accessDenied: false, error: null },
      stalePrs: { stale: [], error: null },
      conflictMerges: { findings: [], error: null },
      untestedDeploys: { findings: [], commitsChecked: 10, error: null },
      pii: { findings: [], filesScanned: 12, error: null },
    };
    const html = render(report({ reposInInstallation: 1, repos: [repo] }));
    expect(html).toContain("gov-critical");
    expect(html).not.toContain("Nothing was scanned");
  });
});
