# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
While in `0.x`, minor versions may include breaking API changes.

## [Unreleased]

## [0.1.0] - 2026-05-22

### Added

- Initial release.
- Library API: `extractBonusItems()` and `toCsv()` exported from `bonbonus`.
- CLI: `bonbonus extract [--format json|csv] [--pretty] [--output <path>]`, with `--help` and `--version`.
- `BONBONUS_CONCURRENCY` env var to tune fan-out (validated as a positive integer).
- `BONBONUS_CLIENT_VERSION` env var to override the AH GraphQL `client-version` header when AH rotates it.
- Exponential backoff with retries on transient 429/5xx and network errors.
- Per-promotion error isolation: a failing promotion no longer drops sibling results; `promotionsQueried` reports successes vs `promotionsTotal`.

[Unreleased]: https://github.com/QuadDepo/bonbonus/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/QuadDepo/bonbonus/releases/tag/v0.1.0
