/**
 * Governance audit results (ported from RepoWatch). Stored as jsonb per audit.
 * Every per-repo result carries `error` so one failing check never hides the rest.
 */

export interface DependabotFinding {
  severity: string;
  package: string;
  summary: string;
  url: string;
}
export interface DependabotResult {
  findings: DependabotFinding[];
  /** The feature was never turned on: a governance gap, not a clean bill of health. */
  disabled: boolean;
  /** The token cannot read alerts: unknown, must not be reported as clean. */
  accessDenied: boolean;
  error: string | null;
}

export interface StalePr {
  number: number;
  title: string;
  daysOpen: number;
  url: string;
}
export interface StalePrResult {
  stale: StalePr[];
  error: string | null;
}

export interface ConflictMerge {
  sha: string;
  messageSummary: string;
  url: string;
}
export interface ConflictMergeResult {
  findings: ConflictMerge[];
  error: string | null;
}

export interface UntestedCommit {
  sha: string;
  messageSummary: string;
  url: string;
  reason: "no_test_run" | "test_run_failed";
}
export interface UntestedDeployResult {
  findings: UntestedCommit[];
  commitsChecked: number;
  error: string | null;
}

export type PiiKind = "email" | "phone_us" | "ssn_us" | "credit_card" | "aadhaar_in";
export interface PiiFinding {
  path: string;
  kind: PiiKind;
  /** Never the raw match: first 2 + last 2 characters only. */
  maskedExcerpt: string;
  likelyBenign: boolean;
}
export interface PiiResult {
  findings: PiiFinding[];
  filesScanned: number;
  error: string | null;
}

export interface RepoAudit {
  repo: string; // owner/name
  url: string;
  private: boolean;
  dependabot: DependabotResult;
  stalePrs: StalePrResult;
  conflictMerges: ConflictMergeResult;
  untestedDeploys: UntestedDeployResult;
  pii: PiiResult;
}

export interface NearDuplicate {
  repoA: string;
  repoB: string;
  similarity: number;
}
export interface SprawlResult {
  totalActiveRepos: number;
  overThreshold: boolean;
  nearDuplicates: NearDuplicate[];
  error: string | null;
}

export interface AuditLimits {
  maxRepos: number;
  commitLookback: number;
  maxPiiFiles: number;
}

export interface AuditReport {
  schemaVersion: 1;
  account: string;
  startedAt: string;
  finishedAt: string;
  limits: AuditLimits;
  reposInInstallation: number;
  repos: RepoAudit[];
  sprawl: SprawlResult;
}

export interface AuditSummary {
  reposAudited: number;
  dependabotOpen: number;
  dependabotCriticalHigh: number;
  dependabotDisabled: number;
  stalePrs: number;
  conflictMerges: number;
  untestedCommits: number;
  piiFindings: number;
  nearDuplicates: number;
  checkErrors: number;
}
