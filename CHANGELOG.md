# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While in `0.x`, minor versions may include breaking API changes.

## [Unreleased]

## [0.2.1] - 2026-05-23

### Fixed

- Linux (and other environments where Node's default OpenSSL cipher list is
  visible to Akamai's bot wall): the TLS Client Hello now uses a restricted
  Chrome-like cipher list via an `undici.Agent` dispatcher. Without this,
  Node's outgoing JA3/JA4 fingerprint was rejected at the edge with HTTP 403
  before any HTTP-layer logic ran. macOS happened to pass; Linux did not.
  Confirmed via JA3/JA4 capture against `tls.peet.ws` (Node-default
  fingerprint blocked, Chrome-cipher fingerprint accepted) and reproduced
  end-to-end against `/gql` (403 → 200) on a Linux Mac mini sharing the same
  public IP as a working macOS box.

### Changed

- Adds `undici@^7` as a runtime dependency to provide the `Agent` constructor.
  Node already bundles undici internally; the package only ships the
  user-facing constructor types.

## [0.2.0] - 2026-05-23

### Changed

- Aligned outgoing GraphQL headers with the current `ah.nl/bonus` web client:
  `client-name` / `client-version` renamed to `x-client-name` / `x-client-version`,
  added `x-client-platform-type: Web`, `sec-ch-ua*`, `sec-fetch-*`,
  `accept-language`, and broadened `accept` to
  `application/graphql-response+json,application/json;q=0.9`.
- Default `x-client-version` bumped from `3.545.8` to `1.32.4` to match AH's
  current versioning scheme.
- Default `user-agent` bumped to Chrome 148.

### Fixed

- Resolves persistent `HTTP 403` from the AH GraphQL endpoint that began after
  AH rotated their client identification scheme.

## [0.1.0] - 2026-05-22

### Added

- Initial release.
- Library API: `extractBonusItems()` and `toCsv()` exported from `bonbonus`.
- CLI: `bonbonus extract [--format json|csv] [--pretty] [--output <path>]`, with `--help` and `--version`.
- `BONBONUS_CONCURRENCY` env var to tune fan-out (validated as a positive integer).
- `BONBONUS_CLIENT_VERSION` env var to override the AH GraphQL `client-version` header when AH rotates it.
- Exponential backoff with retries on transient 429/5xx and network errors.
- Per-promotion error isolation: a failing promotion no longer drops sibling results; `promotionsQueried` reports successes vs `promotionsTotal`.

[Unreleased]: https://github.com/QuadDepo/bonbonus/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/QuadDepo/bonbonus/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/QuadDepo/bonbonus/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/QuadDepo/bonbonus/releases/tag/v0.1.0
