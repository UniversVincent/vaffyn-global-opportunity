# Public Preview Release Checklist

## Release boundary

- Publish product UI, guest chat, progressive profile collection, generic
  research contracts, tests, and self-hosting examples.
- Keep production credentials, user data, payment configuration, provider
  routing, scraping actors, private prompts, deployment topology, recovery
  evidence, and operator records outside the public repository.
- Do not publish generated test output or local cloud-drive state.

## Licensing

- Keep the upstream `LICENSE` file unchanged.
- Keep `THIRD_PARTY_NOTICES.md` in every public source release.
- Product branding may be changed without removing upstream license notices.

## Verification before the first push

- Select the public release model: open core or full source.
- Replace the upstream-only README with an accurate derivative-project README.
- Confirm the repository name and public status.
- Run the focused tests and production build.
- Scan all files selected for commit for credentials and private infrastructure.
- Review the exact staged file list before committing.
- Add the user's GitHub repository as `origin`; retain LibreChat as `upstream`.
- Push only after the public repository contents and visibility are confirmed.

## Current status

The public repository is `UniversVincent/vaffyn-global-opportunity`, using the
existing MIT license and an explicit LibreChat attribution notice. GitHub CLI
authentication, repository identity, local-only path isolation, focused tests,
TypeScript checks, staged-file review, and the high-confidence credential scan
were completed on 2026-09-17. The full production frontend build remains a
documented blocker and is not represented as passing.
