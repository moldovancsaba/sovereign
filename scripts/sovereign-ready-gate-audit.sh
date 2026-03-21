#!/usr/bin/env bash

# Audit or enforce Executable Prompt Package gate for board cards in Ready/In Progress.
# Default mode is dry-run. Use --apply to move invalid cards to Backlog.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VALIDATOR="$SCRIPT_DIR/sovereign-validate-prompt-package.js"
SETTER="$SCRIPT_DIR/sovereign-set-project-fields.sh"

PROJECT_OWNER="${MVP_PROJECT_OWNER:-moldovancsaba}"
REPO_NAME="${MVP_REPO:-sovereign}"
PROJECT_NUM="${MVP_PROJECT_NUMBER:-1}"

APPLY=0
COMMENT=0
PRODUCT_FILTER=""

while [ $# -gt 0 ]; do
  case "$1" in
    --apply) APPLY=1; shift ;;
    --comment) COMMENT=1; shift ;;
    --product) PRODUCT_FILTER="${2:-}"; shift 2 ;;
    *)
      echo "Unknown arg: $1" >&2
      echo "Usage: $0 [--apply] [--comment] [--product <name>]" >&2
      exit 1
      ;;
  esac
done

if [ ! -f "$VALIDATOR" ]; then
  echo "Missing validator script: $VALIDATOR" >&2
  exit 1
fi
if [ ! -f "$SETTER" ]; then
  echo "Missing project-field setter: $SETTER" >&2
  exit 1
fi

ALL_ITEMS='[]'
CURSOR=""

while :; do
  if [ -z "$CURSOR" ]; then
    PAGE_JSON=$(gh api graphql -f query='
query($owner: String!, $num: Int!) {
  user(login: $owner) {
    projectV2(number: $num) {
      items(first: 100) {
        pageInfo { hasNextPage endCursor }
        nodes {
          content {
            __typename
            ... on Issue { number title url }
          }
          fieldValues(first: 30) {
            nodes {
              __typename
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field { ... on ProjectV2FieldCommon { name } }
              }
            }
          }
        }
      }
    }
  }
}' -f owner="$PROJECT_OWNER" -F num="$PROJECT_NUM")
  else
    PAGE_JSON=$(gh api graphql -f query='
query($owner: String!, $num: Int!, $after: String!) {
  user(login: $owner) {
    projectV2(number: $num) {
      items(first: 100, after: $after) {
        pageInfo { hasNextPage endCursor }
        nodes {
          content {
            __typename
            ... on Issue { number title url }
          }
          fieldValues(first: 30) {
            nodes {
              __typename
              ... on ProjectV2ItemFieldSingleSelectValue {
                name
                field { ... on ProjectV2FieldCommon { name } }
              }
            }
          }
        }
      }
    }
  }
}' -f owner="$PROJECT_OWNER" -F num="$PROJECT_NUM" -f after="$CURSOR")
  fi

  PAGE_ITEMS=$(echo "$PAGE_JSON" | jq '.data.user.projectV2.items.nodes')
  ALL_ITEMS=$(jq -n --argjson a "$ALL_ITEMS" --argjson b "$PAGE_ITEMS" '$a + $b')

  HAS_NEXT=$(echo "$PAGE_JSON" | jq -r '.data.user.projectV2.items.pageInfo.hasNextPage')
  NEXT_CURSOR=$(echo "$PAGE_JSON" | jq -r '.data.user.projectV2.items.pageInfo.endCursor // empty')
  if [ "$HAS_NEXT" != "true" ] || [ -z "$NEXT_CURSOR" ]; then
    break
  fi
  CURSOR="$NEXT_CURSOR"
done

FILTERED=$(echo "$ALL_ITEMS" | jq -r --arg product "$PRODUCT_FILTER" '
  .[]
  | select(.content.__typename == "Issue")
  | (.fieldValues.nodes | map(select(.__typename == "ProjectV2ItemFieldSingleSelectValue") | {(.field.name): .name}) | add) as $f
  | select(($f.Status == "Ready") or ($f.Status == "In Progress"))
  | if ($product == "") then . else select(($f.Product // "") == $product) end
  | [
      .content.number,
      ($f.Status // "-"),
      ($f.Product // "-"),
      ($f.Agent // "-"),
      (.content.title // "")
    ] | @tsv
')

if [ -z "$FILTERED" ]; then
  echo "No Ready/In Progress cards matched."
  exit 0
fi

total=0
invalid=0
enforced=0

while IFS=$'\t' read -r issue_num status product agent title; do
  [ -z "$issue_num" ] && continue
  total=$((total + 1))

  tmp_json="$(mktemp)"
  if node "$VALIDATOR" --issue "$issue_num" --repo "$PROJECT_OWNER/$REPO_NAME" --json >"$tmp_json" 2>/dev/null; then
    echo "OK    #$issue_num [$product/$status/$agent] $title"
    rm -f "$tmp_json"
    continue
  fi

  invalid=$((invalid + 1))
  summary=$(jq -r '.summary' "$tmp_json")
  missing=$(jq -r '.missingSections | join(", ")' "$tmp_json")
  weak=$(jq -r '.weakSections | join(", ")' "$tmp_json")
  echo "FAIL  #$issue_num [$product/$status/$agent] $title"
  echo "      $summary"

  if [ "$APPLY" -eq 1 ]; then
    "$SETTER" "$issue_num" --status Backlog >/dev/null
    enforced=$((enforced + 1))
    echo "      -> moved to Backlog"
    if [ "$COMMENT" -eq 1 ]; then
      note="Ready gate enforcement: this card was moved to Backlog because Executable Prompt Package is incomplete."
      req="Required sections: Objective, Execution Prompt, Scope / Non-goals, Constraints, Acceptance Checks, Delivery Artifact."
      details="Missing: ${missing:-none}. Weak: ${weak:-none}."
      gh issue comment "$issue_num" --repo "$PROJECT_OWNER/$REPO_NAME" --body "$note"$'\n\n'"$details"$'\n'"$req" >/dev/null
      echo "      -> comment posted"
    fi
  fi
  rm -f "$tmp_json"
done <<< "$FILTERED"

echo "Audit summary: checked=$total invalid=$invalid enforced=$enforced apply=$APPLY"
