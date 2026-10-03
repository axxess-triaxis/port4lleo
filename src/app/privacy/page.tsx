import type { Metadata } from "next";
import { LegalPage, PUBLISHER, SUPPORT_URL } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy policy">
      <p>
        PORT4LLEO is published by {PUBLISHER}. This policy explains what the PORT4LLEO GitHub App reads, what it stores and
        how to remove it.
      </p>
      <section>
        <h2>What PORT4LLEO reads</h2>
        <ul>
          <li>Your public GitHub profile and public activity: repositories, contributions, pull requests and GitHub Projects.</li>
          <li>
            For repositories you install the app on: repository metadata, file contents, Actions runs, check runs,
            deployments, pull requests and Dependabot alerts. All access is read-only. PORT4LLEO cannot change your
            code, settings or issues.
          </li>
          <li>If you add one, your Vercel project list, read with the token you provide.</li>
        </ul>
      </section>
      <section>
        <h2>What PORT4LLEO stores</h2>
        <ul>
          <li>Your GitHub login, name and avatar URL.</li>
          <li>Portfolio snapshots: counts and repository names. Private repositories are counted but never named.</li>
          <li>
            Governance audits: findings per repository. Possible personal data found in files is stored only as a masked
            excerpt (the first two and last two characters). The full value is never stored or shown.
          </li>
          <li>GitHub and Vercel access tokens, encrypted with AES-256-GCM. They are used only to refresh your data.</li>
          <li>Corrections you enter, such as hackathons or prototypes.</li>
        </ul>
        <p>PORT4LLEO does not sell data, show ads or use your code to train models.</p>
      </section>
      <section>
        <h2>Who can see it</h2>
        <ul>
          <li>Your portfolio is public by default. You can make it private from the dashboard.</li>
          <li>
            Governance audits are never public. A signed-in user sees findings only for repositories they can already
            access on GitHub. This is checked against GitHub each time the page loads.
          </li>
        </ul>
      </section>
      <section>
        <h2>Retention and deletion</h2>
        <ul>
          <li>The 30 most recent portfolio snapshots and 30 most recent audits per account are kept. Older ones are deleted.</li>
          <li>Uninstalling the app deletes that installation and all of its audits immediately.</li>
          <li>To delete your account and portfolio data, open a request at <a href={SUPPORT_URL}>{SUPPORT_URL}</a>.</li>
        </ul>
      </section>
      <section>
        <h2>Service providers</h2>
        <p>
          Data is hosted on Supabase (database and sign-in) and Vercel (application hosting). Both process data only to
          run PORT4LLEO.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          Questions: <a href={SUPPORT_URL}>{SUPPORT_URL}</a>.
        </p>
      </section>
    </LegalPage>
  );
}
