<p align="center">
  <img src="client/public/assets/vaffyn.svg" width="88" alt="Vaffyn logo">
</p>

<h1 align="center">Vaffyn Global Opportunity Assistant</h1>

<p align="center">
  A Chinese-first, multilingual open-source assistant for researching global jobs and overseas opportunities.
</p>

<p align="center">
  <strong>English</strong> · <a href="README.zh.md">简体中文</a> ·
  <a href="https://avenory.vaffyn.com/">Live preview</a>
</p>

> Early public preview. The core interaction and research prototypes are usable, but this repository is not production-ready and several paid or data-intensive features are intentionally not connected yet.

## Mission

Job seekers should not need to understand every overseas job board, government site, or policy manual before they can explore a wider set of options. This project is building a chat-first research assistant that helps a user:

- explain their experience naturally in Chinese or another supported language;
- answer only the follow-up questions that can change the research direction;
- build a confirmed, reusable overseas profile instead of completing one long form;
- research current job and policy information with traceable sources; and
- understand what is known, what is missing, and what still requires a qualified professional.

The project stops before submitting a job or immigration application. It is an information and research tool, not an automated applicant, immigration adviser, or law firm.

## What Works Today

- **Chat-first entry:** a visitor can open the product and start from a normal chat screen without registering first.
- **Progressive access:** the current prototype allows 5 guest turns, then supports a local account flow with a 10-turn free tier. Standard and advanced limits are represented in code, but payment is not connected.
- **Progressive profiling:** the assistant can ask focused follow-up questions, extract supported facts, show the proposed profile, and require confirmation before saving it.
- **Multilingual interface:** Simplified Chinese, Traditional Chinese, and English product strings are included. Simplified Chinese is the primary product language.
- **Advanced-feature gates:** deep research, document input, evidence export, and extended data work are restricted to the advanced tier in the current policy model.
- **Local document parsing:** TXT, Markdown, and DOCX text extraction is implemented with size and format limits. PDF parsing is not implemented yet.
- **Voice capture prototype:** local recording and playback are implemented; transcription is visibly marked as pending.
- **Evidence research sample:** a New Zealand visa-medical topic demonstrates a source registry, official-page refresh, version hashes, freshness checks, rights checks, citation validation, gaps, and gated export.
- **Accounts and isolation prototype:** local account persistence is separated from the public evidence store. This is not yet a production identity system.

The live preview is available at [avenory.vaffyn.com](https://avenory.vaffyn.com/). Availability can change while deployment work is in progress.

## What Is Not Finished

- Production payments, subscriptions, refunds, invoices, or real charging.
- Production authentication, account recovery, email or SMS verification, and abuse controls.
- Live job aggregation across multiple platforms and external data connectors.
- Automated housing, school, or map research.
- Production voice transcription and PDF resume parsing.
- A complete country-by-country policy source registry.
- Automated job applications, application tracking, or outreach to employers.
- Production deployment hardening and a clean full frontend build on a fresh machine.

No API key, user record, private deployment file, or production payment configuration is included in this repository.

## Product Principles

1. **Ask before concluding.** Request only missing facts whose answers can materially change the next research step.
2. **Confirm before saving.** Extracted profile facts remain proposals until the user confirms them.
3. **Official sources before summaries.** Policy research should start from a maintained source registry and re-check authoritative pages when freshness matters.
4. **Show uncertainty.** Missing pages, stale versions, conflicts, and unverified claims must remain visible.
5. **Research is not representation.** The product does not submit applications or silently cross into regulated individual advice.
6. **Paid depth, not paid truth.** Paid tiers may fund more retrieval and analysis, but basic answers must not become less accurate on purpose.

## Repository Map

| Path | Purpose |
| --- | --- |
| `client/src/components/Overseas` | Guest chat, profile confirmation, membership gates, document and voice UI, research screen |
| `packages/api/src/guest` | Intake response validation, quotas, sessions, local accounts, and profile updates |
| `packages/api/src/research` | Source registry, fetch and parse pipeline, evidence validation, version store, and export |
| `packages/data-provider/src/types` | Shared guest, profile, membership, and research contracts |
| `packages/data-schemas/src/preview` | Isolated preview persistence |
| `e2e` | Guest, preparation, and research browser scenarios |
| `THIRD_PARTY_NOTICES.md` | Upstream LibreChat attribution and license reference |

## Local Development

Prerequisites follow the upstream project: Node.js 24, npm, MongoDB, and the services required by the LibreChat base.

```bash
git clone https://github.com/UniversVincent/vaffyn-global-opportunity.git
cd vaffyn-global-opportunity
npm ci
npm run build:data-provider
npm run frontend:dev
```

The evidence sample is a separate local service and requires absolute, separate directories for public evidence and private preview accounts:

```bash
npm --workspace packages/data-schemas run build:preview
npm --workspace packages/api run build:research
RESEARCH_DATA_DIR=/absolute/public-evidence \
VAFFYN_LOCAL_ACCOUNTS_DIR=/absolute/private-accounts \
npm --workspace packages/api run start:research
```

AI-backed intake is disabled unless the operator explicitly enables it and supplies server-side configuration. Never commit a real key:

```dotenv
VAFFYN_ENABLE_LOCAL_AI=true
VAFFYN_INTAKE_MODEL=your-supported-model
OPENAI_API_KEY=your-server-side-key
```

The setup is still being simplified. See the [official LibreChat documentation](https://www.librechat.ai/docs) for the underlying services.

## Verification Status

Verified locally for this preview:

- 9 focused client suites, 65 tests passing;
- 3 guest, membership, and research API suites, 63 tests passing;
- the custom research TypeScript projects compile successfully; and
- the public preview root returned HTTP 200 on 2026-09-17.

Known blocker: the full production Vite build currently stops on an unresolved local `@codesandbox/sandpack-client` dependency. The focused tests and custom TypeScript builds pass, but a clean production build has not yet been demonstrated. See [`ROADMAP.md`](ROADMAP.md).

## Contributing

The most useful early contributions are reproducible setup fixes, source-validation tests, accessibility improvements, account isolation review, and small country or job-source registry additions with primary-source evidence.

Read [`CONTRIBUTING.md`](CONTRIBUTING.md), [`SECURITY.md`](SECURITY.md), and the [`ROADMAP.md`](ROADMAP.md) before opening a pull request.

## Open Source Support

The maintainer is applying to OpenAI's open-source support programs. Any awarded API credits or tooling access will be used for public maintenance work: issue triage, test coverage, dependency and security review, source-verification tooling, accessibility, documentation, and reproducible deployment. Support will not be represented as product endorsement or proof that unfinished features work.

## License and Attribution

This project is a derivative of [LibreChat](https://github.com/danny-avila/LibreChat), distributed under the MIT License. The upstream license and copyright notice remain in [`LICENSE`](LICENSE), with additional attribution in [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

Changing product branding does not erase upstream authorship. Some internal package names remain unchanged for compatibility.
