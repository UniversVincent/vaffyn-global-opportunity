# Contributing

This repository is an early public preview. Small, reviewable changes with tests are more useful than broad rewrites.

## Before Opening an Issue

- Check the current limitations in `README.md` and `ROADMAP.md`.
- Remove API keys, personal profiles, resumes, cookies, deployment addresses, and private logs from reproductions.
- For policy or job-data claims, include the primary source URL and the date it was checked.

## Development

1. Create a branch from `main`.
2. Install with `npm ci` using Node.js 24.
3. Keep new backend code in `packages/api` and shared contracts in `packages/data-provider`.
4. Use existing `@librechat/client` primitives and semantic theme roles for frontend work.
5. Add focused tests for changed behavior.
6. Run the relevant tests and report anything you could not run.

Do not commit real credentials. Use documented environment variable names and placeholder values only.

## Pull Requests

A pull request should explain:

- the user problem it solves;
- the behavioral change and its boundaries;
- tests run and their results;
- privacy, source-rights, or regulated-advice implications; and
- known limitations left for later work.

Large country-source additions should start with a small, reviewable topic rather than an unbounded crawl.

## Upstream Work

Changes inherited unchanged from LibreChat should normally be proposed to the [upstream project](https://github.com/danny-avila/LibreChat). Product-specific guest, profile, and evidence research work belongs here.
