# 0002 — No static export

**Status:** accepted · **Date:** 2026-10-03

## Context

The site is a documentation and marketing surface with no database and no
per-request computation. A static export would be faster, free, and impossible
to break at 3am.

## Decision

No `output: "export"`. The application is built and served as a server app.

## Why

The decisive question is what the app _is_, not what it looks like today. It is
an App Router project with route handlers on the server boundary, which means a
static export is not a flag away — it is a rewrite of the delivery model at the
moment someone adds the first endpoint that needs a request.

Getting that wrong is cheap in week one and expensive in week six: the symptom is
a runtime error that only appears in production, because the build happily
succeeded. Deciding it up front is one line in `vercel.json` and an ADR.

**Consequence accepted:** the static assets are served by a server, so the cold
start is marginally slower than a CDN would be. For a documentation site with
two hundred kilobytes of content, that is not a measurable difference.

**Revisit if:** the app stops needing any request-time work AND stays that way
for two consecutive releases. Not before.
