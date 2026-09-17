export type ResearchSourceKind =
  | 'official_guidance'
  | 'law_and_instructions'
  | 'professional_commentary'
  | 'quality_rule';

export type ResearchStatus = 'verified' | 'review_required' | 'unavailable';

export interface ResearchCitation {
  sourceId: string;
  section: string;
  quotation: string;
}

export interface ResearchClaim {
  id: string;
  title: string;
  explanation: string;
  status: ResearchStatus;
  citations: ResearchCitation[];
}

export interface ResearchSource {
  id: string;
  country: string;
  institution: string;
  title: string;
  url: string;
  kind: ResearchSourceKind;
  relatedIds: string[];
  status: ResearchStatus;
  checkedAt: string | null;
  lastAttemptAt: string | null;
  hash: string | null;
  reviewedHash: string | null;
  effectiveAt: string | null;
  expiresAt: string | null;
  httpLastModified: string | null;
  versionCount: number;
  licenseUrl: string;
  rights: 'attribution_excerpt' | 'link_only';
}

export interface ResearchGap {
  id: string;
  description: string;
  url: string | null;
}

export interface ResearchReport {
  schemaVersion: 1;
  registryVersion: string;
  id: string;
  topic: string;
  title: string;
  language: 'zh-Hans';
  generatedAt: string;
  reviewedAt: string;
  reviewValidUntil: string;
  scope: string;
  boundary: string;
  claims: ResearchClaim[];
  sources: ResearchSource[];
  gaps: ResearchGap[];
  complete: false;
}

export interface ResearchHistory {
  id: string;
  generatedAt: string;
  verifiedClaims: number;
  totalClaims: number;
}

export interface ResearchResponse {
  report: ResearchReport;
  history: ResearchHistory[];
  nextRefreshAt: string;
}

export interface ResearchArchive {
  filename: string;
  base64: string;
  sha256: string;
}
