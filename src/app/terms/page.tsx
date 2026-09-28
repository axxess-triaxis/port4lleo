import type { Metadata } from "next";
import { LegalPage, PUBLISHER, SUPPORT_URL } from "@/components/LegalPage";

export const metadata: Metadata = { title: "Terms of service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of service">
      <p>
        These terms cover your use of the hosted PORT4LEO service, published by {PUBLISHER}. The source code is separately
        available under the MIT License.
      </p>
      <section>
        <h2>The service</h2>
        <p>
          PORT4LEO builds a portfolio and Builder Score from your GitHub activity, and audits repositories you install it
          on. It is currently offered free of charge.
        </p>
      </section>
      <section>
        <h2>Accuracy</h2>
        <p>
          Some metrics and audit findings are inferred by heuristics and are labelled that way. Audit findings are
          candidates to review, not verdicts. A clean audit does not mean a repository is secure. PORT4LEO does not
          replace a security review.
        </p>
      </section>
      <section>
        <h2>Your responsibilities</h2>
        <ul>
          <li>Only install PORT4LEO on accounts and organizations you are authorized to grant access to.</li>
          <li>Don&apos;t use the service to misrepresent your own or anyone else&apos;s work.</li>
          <li>Self-declared portfolio entries must be accurate.</li>
        </ul>
      </section>
      <section>
        <h2>Availability and changes</h2>
        <p>
          The service is provided as is, without warranties. It may change or be discontinued. Material changes to these
          terms will be posted on this page.
        </p>
      </section>
      <section>
        <h2>Contact</h2>
        <p>
          <a href={SUPPORT_URL}>{SUPPORT_URL}</a>
        </p>
      </section>
    </LegalPage>
  );
}
