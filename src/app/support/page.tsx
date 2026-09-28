import type { Metadata } from "next";
import { LegalPage, SUPPORT_URL } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Support" };

export default function SupportPage() {
  return (
    <LegalPage title="Support">
      <p>
        Open an issue at <a href={SUPPORT_URL}>{SUPPORT_URL}</a> for bugs, questions, data deletion requests or feature
        ideas. Please don&apos;t paste tokens or private repository contents into an issue.
      </p>
      <section>
        <h2>Common questions</h2>
        <ul>
          <li>
            <strong className="text-ink">A number looks wrong.</strong> Tiles marked &ldquo;inferred&rdquo; use
            heuristics, explained on the <a href="/scoring">scoring page</a>. Correct them with a{" "}
            <code>portfolio.yml</code> or from the dashboard.
          </li>
          <li>
            <strong className="text-ink">Private repos are missing.</strong> Install PORT4LEO on your own account and select
            those repositories.
          </li>
          <li>
            <strong className="text-ink">An audit says a check was unavailable.</strong> The app couldn&apos;t read that
            data, for example because Dependabot alerts are disabled. Unavailable is never reported as clean.
          </li>
          <li>
            <strong className="text-ink">Remove PORT4LEO.</strong> Uninstall it from your GitHub settings under
            Applications. Its audits are deleted immediately.
          </li>
        </ul>
      </section>
    </LegalPage>
  );
}
