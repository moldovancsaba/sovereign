#!/usr/bin/env bash

# Validates that a handover document has been modified to enforce operational continuity.
# Checks for uncommitted changes, recent commits, or recent file modifications.

set -e

# Find any handover files in the root or docs directory of the current project
HANDOVER_FILES=$(find . -maxdepth 2 -type f -name "*HANDOVER*.md" 2>/dev/null || true)

if [ -z "$HANDOVER_FILES" ]; then
  echo "❌ Error: No handover document found (e.g., docs/HANDOVER.md or docs/SENTINELSQUAD_HANDOVER.md)." >&2
  exit 1
fi

for FILE in $HANDOVER_FILES; do
  # 1. Check if file has uncommitted changes or is untracked
  if git status --porcelain "$FILE" 2>/dev/null | grep -q .; then
    echo "✅ Valid handover update detected (uncommitted changes in $FILE)."
    exit 0
  fi
  
  # 2. Check if file was committed recently (last 24 hours)
  if git log -1 --since="24 hours ago" --format="%H" "$FILE" 2>/dev/null | grep -q .; then
    echo "✅ Valid handover update detected (recent commit in $FILE)."
    exit 0
  fi
  
  # 3. Check physical file modification time (last 24 hours / 1440 min)
  if find "$FILE" -mmin -1440 2>/dev/null | grep -q .; then
    echo "✅ Valid handover update detected (recently modified file: $FILE)."
    exit 0
  fi
done

echo "❌ Error: Handover document has not been updated explicitly." >&2
echo "CRITICAL RULE: You must append an 'Active Session Update' to the handover document before marking a task as Done." >&2
echo "Checked files:" >&2
for FILE in $HANDOVER_FILES; do
  echo "  - $FILE" >&2
done
exit 1
