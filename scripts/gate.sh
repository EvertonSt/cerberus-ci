#!/usr/bin/env bash
# gate.sh - the one command that proves this repository is shippable.
#
# Every step reports ITS OWN exit code. Nothing is chained through a pipe:
# `tsc -b | tail -5` exits with `tail`'s status, so a failing typecheck reports
# as a passing gate. That single mistake is the reason a repository can look
# green on a build machine and be broken everywhere else.
#
# Usage:  bash scripts/gate.sh          # everything
#         bash scripts/gate.sh --fast   # skip e2e and the production build
set -uo pipefail

cd "$(dirname "$0")/.." || exit 2

FAST=0
[ "${1:-}" = "--fast" ] && FAST=1

FAILED=()
RESULTS=()

run_step() {
  local name="$1"; shift
  printf '\n\033[1m── %s\033[0m\n' "$name"
  local start=$SECONDS
  # Capture the status IMMEDIATELY, on its own line.
  #
  # `if "$@"; then ... fi` reads `$?` as the if-COMPOUND status, which is 0
  # when the condition fails and there is no else branch. The first version of
  # this script did exactly that and reported a genuinely failing typecheck as
  # "FAIL typecheck (exit 0)" - the same class of bug as piping a typecheck
  # into `tail`, just pointing the other way.
  "$@"
  local code=$?
  if [ "$code" -eq 0 ]; then
    RESULTS+=("PASS  $name ($(( SECONDS - start ))s)")
  else
    RESULTS+=("FAIL  $name (exit $code, $(( SECONDS - start ))s)")
    FAILED+=("$name")
  fi
  return $code
}

run_step "format:check" pnpm format:check
run_step "lint"          pnpm lint
run_step "typecheck"     pnpm typecheck
run_step "unit tests"    pnpm test:unit
run_step "verify:secrets"  pnpm verify:secrets
run_step "verify:links"    pnpm verify:links
run_step "verify:attribution" pnpm verify:attribution

if [ "$FAST" -eq 0 ]; then
  run_step "coverage floor" pnpm test:unit:coverage
  run_step "build"          pnpm build
  run_step "e2e"            pnpm test:e2e
fi

printf '\n\033[1m══ GATE SUMMARY ══\033[0m\n'
for line in "${RESULTS[@]}"; do
  printf '  %s\n' "$line"
done

if [ "${#FAILED[@]}" -ne 0 ]; then
  printf '\n\033[31mGATE FAILED — %d step(s): %s\033[0m\n' \
    "${#FAILED[@]}" "${FAILED[*]}"
  exit 1
fi

printf '\n\033[32mGATE PASSED — %d steps, all green\033[0m\n' "${#RESULTS[@]}"
exit 0