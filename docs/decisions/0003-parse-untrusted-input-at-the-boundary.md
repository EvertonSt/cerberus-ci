# 0003 — Parse untrusted input at the boundary, and return `unknown` inward

**Status:** accepted · **Date:** 2026-10-03

## Context

Every parser in this project takes bytes from outside: a JUnit XML file, a
Playwright JSON report, a trace file, and a model's JSON response. In the code
as inherited, each did `JSON.parse(...)` or an equivalent and then walked the
result. `JSON.parse` returns `any`, so the entire parsed shape was unchecked —
which is how a strict typecheck still reported 149 errors while three parsers
handed `any` to the rest of the system.

## Decision

Two rules, applied at every parse site:

1. **The parser's return type is declared.** A parsed Playwright report is
   `unknown`, narrowed by a type guard, not cast to a hopeful type.
2. **Narrowing is a check, not a cast.** `hasArrayProperty(data, "suites")` and
   `isClassificationShape(parsed)` return `value is T` and are written so that
   reading the guard tells you what the code trusts.

## Why

The alternative — `const data = JSON.parse(content) as SomeShape` — is an
unchecked promise that the file has the shape we assume. It moves the failure
from ingest time to a property access three modules away, where it surfaces as
`Cannot read properties of undefined` in a function that has nothing to do with
parsing.

The measurable effect: `no-unsafe-member-access` and `no-unsafe-assignment` went
from 167 findings to 0, and the two model-response paths now have a documented
answer for "the model returned something unusable" instead of an exception from
a property access.

**Cost:** the guards are real code that must be maintained. Accepted — a parser
whose input contract changes is exactly the moment you want the compiler
pointing at every consumer.
