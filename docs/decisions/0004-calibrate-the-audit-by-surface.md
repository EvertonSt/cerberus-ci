# 0004 — Calibrate the security audit by surface, not by threshold

**Status:** accepted · **Date:** 2026-10-03

## Context

`pnpm audit` on a fresh project finds something. The tempting fix is to move the
threshold until the job is green.

## Decision

The audit is split by **surface**:

| Surface                  | Threshold  | Why                                                                                          |
| ------------------------ | ---------- | -------------------------------------------------------------------------------------------- |
| Production dependencies  | `high`     | These ship. An advisory here reaches users.                                                  |
| Development dependencies | `critical` | These never ship; blocking a release on a dev-only advisory trains people to ignore the job. |

The development audit is `continue-on-error`, and a **tripwire step** fails if
`pnpm-workspace.yaml` ever declares `ignoreCves` without a reason attached.

## Why

A threshold moved to make a run green leaves a job that displays the word
"audit" while measuring nothing. That is worse than a red job, because it
converts a known unknown into a false assurance — and it is invisible, since
the job is green.

The tripwire exists because the exclusion list is where this always decays. A
comment explaining why an exception is justified is not a mechanism; a step that
fails when an unjustified exception appears is.

**Rule that follows:** never point an `overrides` entry at a version that does
not exist. If the newest release of a package is the vulnerable one, there is
nothing to point at, and the honest move is to accept the finding until an
upstream fix lands — with the tripwire making sure somebody decided that
deliberately.
