#!/usr/bin/env bash
# Migrate ROADMAP.md and TASKLIST.md (amanoba) into GitHub Project issues.
# - ROADMAP vision items → new issues, Status = Roadmap
# - TASKLIST items not broken down (scoping/define) → new issues, Status = Backlog
# - TASKLIST items broken down to actionable deliverables → new issues, Status = Ready
# Existing issue #2 is P2 #3 (Dashboard/course pages); we set it to Ready, do not duplicate.
# Requires: gh (with project scope), jq. Run from sovereign repo root.
# Usage: ./scripts/migrate-roadmap-tasklist-to-project.sh [--dry-run]
#         ./scripts/migrate-roadmap-tasklist-to-project.sh [--skip-roadmap] [--skip-backlog] [--skip-ready-first N]
# To resume after partial run: --skip-roadmap --skip-backlog --skip-ready-first 3

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPO="${MVP_REPO:-sovereign}"
OWNER="${MVP_PROJECT_OWNER:-moldovancsaba}"
DRY_RUN=""
SKIP_ROADMAP=""
SKIP_BACKLOG=""
SKIP_READY_FIRST="0"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --dry-run)            DRY_RUN=1; shift ;;
    --skip-roadmap)       SKIP_ROADMAP=1; shift ;;
    --skip-backlog)       SKIP_BACKLOG=1; shift ;;
    --skip-ready-first)   SKIP_READY_FIRST="$2"; shift 2 ;;
    *) break ;;
  esac
done

cd "$REPO_ROOT"

if ! gh auth status 2>/dev/null | grep -q 'project\|read:project'; then
  echo "GitHub CLI needs project scope. Run: gh auth refresh -h github.com -s read:project,project" >&2
  exit 1
fi

# --- Helpers ---
create_issue() {
  local title="$1"
  local body="$2"
  if [[ -n "$DRY_RUN" ]]; then
    echo "[DRY-RUN] Would create issue: $title"
    return 0
  fi
  local url
  url=$(gh issue create --repo "$OWNER/$REPO" --title "$title" --body "$body" 2>/dev/null)
  # Extract issue number from URL (e.g. .../issues/3 or .../issues/3)
  if [[ "$url" =~ /issues/([0-9]+) ]]; then
    echo "${BASH_REMATCH[1]}"
  fi
}

set_board_status() {
  local num="$1"
  local status="$2"
  if [[ -z "$num" ]]; then return; fi
  if [[ -n "$DRY_RUN" ]]; then
    echo "[DRY-RUN] Would set issue #$num Status=$status"
    return 0
  fi
  "$SCRIPT_DIR/sovereign-set-project-fields.sh" "$num" --status "$status" --product amanoba
}

# --- 1) ROADMAP items → Status = Roadmap ---
if [[ -z "$SKIP_ROADMAP" ]]; then
echo "=== Creating Roadmap (vision) issues ==="
roadmap_issues=()
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  title=$(echo "$line" | cut -d'|' -f1 | sed 's/^ *//;s/ *$//')
  body=$(echo "$line" | cut -d'|' -f2- | sed 's/^ *//;s/ *$//')
  if [[ -z "$title" ]]; then continue; fi
  num=$(create_issue "[Roadmap] $title" "**Source:** ROADMAP.md (vision)

$body

---
*Migrated to board; Product = amanoba. Status = Roadmap.*")
  if [[ -n "$num" ]]; then
    roadmap_issues+=("$num")
    set_board_status "$num" "Roadmap"
  fi
done << 'ROADMAP_ITEMS'
Multiple courses: enrolment + prerequisites|Enrolment in several courses at once; prerequisites so learners follow a sensible order.
Live sessions|Scheduled live lessons with instructors.
AI-powered personalisation|Adaptive difficulty and recommendations from assessments.
Instructor dashboard|Instructors create and manage their own courses.
Mobile app|Native app and offline access for learners.
Video lessons|Video in lessons; in-lesson quizzes.
Global default certificate|Admins define a default certification template that automatically applies to courses without their own; new courses consistent out of the box.
Custom certificate library|Admins create and save reusable certification templates in the admin UI and assign them to individual courses.
ROADMAP_ITEMS
fi

# --- 2) TASKLIST → Backlog (not broken down: scoping / define / design) ---
if [[ -z "$SKIP_BACKLOG" ]]; then
echo "=== Creating Backlog (not yet broken down) issues ==="
backlog_titles=(
  "[P3] Design A/B test for one key email (e.g. welcome or day-1); variant selection and track which variant sent"
  "[P4] Mobile: Scope — Document target (React Native/Expo vs PWA-only); offline data and sync strategy"
  "[P4] AI: Define adaptive difficulty for assessments (e.g. next question difficulty from last N answers); data model or config"
  "[P4] Instructor: Define instructor role (e.g. RBAC); link instructor to courses they own"
  "[P4] Instructor: Scope instructor admin — which course/lesson/quiz actions they can do vs admin-only"
)
backlog_bodies=(
  "Optional. Goal: A/B testing for key emails. Source: TASKLIST P3 Email automation."
  "Source: TASKLIST P4 Mobile app #1. Not yet broken down to implementation tasks."
  "Source: TASKLIST P4 AI-powered personalisation #1."
  "Source: TASKLIST P4 Instructor dashboard #1."
  "Source: TASKLIST P4 Instructor dashboard #2."
)
for i in "${!backlog_titles[@]}"; do
  num=$(create_issue "${backlog_titles[$i]}" "**Source:** TASKLIST.md (Backlog — not yet broken down to actionable items)

${backlog_bodies[$i]}

---
*Product = amanoba. Status = Backlog.*")
  if [[ -n "$num" ]]; then set_board_status "$num" "Backlog"; fi
done
fi

# --- 3) TASKLIST → Ready (actionable deliverables) ---
# Skip P2 #3 (Dashboard/course pages) — already issue #2; we set #2 to Ready below.
echo "=== Creating Ready (actionable) issues ==="
ready_titles=(
  "[P2] Email/scheduler: Respect multiple enrolments (daily lesson per enrolled course, no duplicate sends)"
  "[P3] MailerLite or ActiveCampaign integration: sync subscribers, send campaign from platform or webhook"
  "[P3] Course achievements: Add more leaderboard metrics (e.g. consistency)"
  "[P3] Course achievements: New course achievement types (e.g. early finisher, perfect week); seed and wire to achievement engine"
  "[P4] Mobile: Strengthen service worker and caching for course/lesson content and key API responses (PWA)"
  "[P4] Mobile: If native — repo or prototype for mobile client; auth and API contract alignment"
  "[P4] Live: Data model — LiveSession (courseId, scheduledAt, duration, meetingUrl or provider id); optional instructor"
  "[P4] Live: API — CRUD for live sessions (admin); list upcoming for a course; optional enrolment/reminder"
  "[P4] Live: UI — Show upcoming live sessions on course page; link to meeting; optional calendar export"
  "[P4] Live: Integrate meeting provider (e.g. Zoom, Meet) — link or embed"
  "[P4] AI: Recommendation source — use assessment results + course progress to suggest next lesson or course; API and simple algorithm"
  "[P4] AI: UI — Surface recommendations (e.g. Recommended for you on dashboard or course page)"
  "[P4] Community: Notifications — New reply (in-thread or in group); optional mentions"
  "[P4] Community: Reactions/likes on posts (reuse pattern: one model/API/component, discriminator)"
  "[P4] Community: Moderation tools — Bulk actions, report queue"
  "[P4] Instructor: UI — Instructor view of My courses and course builder (reuse admin patterns with permission checks)"
  "[P4] Video: Data model — Lesson supports video URL or embed (e.g. videoUrl, provider); optional in-lesson quiz"
  "[P4] Video: UI — Render video in lesson viewer; optional in-lesson quiz component and submit"
  "[P4] Video: Email — Lesson email can link to Watch video or in-platform lesson; no video in email body for MVP"
)
ready_bodies=(
  "Source: TASKLIST P2 #4. Actionable."
  "Source: TASKLIST P3 Email #2. Optional."
  "Source: TASKLIST P3 Course achievements #1. Optional."
  "Source: TASKLIST P3 Course achievements #2. Optional."
  "Source: TASKLIST P4 Mobile #2."
  "Source: TASKLIST P4 Mobile #3."
  "Source: TASKLIST P4 Live sessions #1."
  "Source: TASKLIST P4 Live sessions #2."
  "Source: TASKLIST P4 Live sessions #3."
  "Source: TASKLIST P4 Live sessions #4."
  "Source: TASKLIST P4 AI #2."
  "Source: TASKLIST P4 AI #3."
  "Source: TASKLIST P4 Community Phase 3 #1. Optional."
  "Source: TASKLIST P4 Community Phase 3 #2. Optional."
  "Source: TASKLIST P4 Community Phase 3 #3. Optional."
  "Source: TASKLIST P4 Instructor #3."
  "Source: TASKLIST P4 Video lessons #1."
  "Source: TASKLIST P4 Video lessons #2."
  "Source: TASKLIST P4 Video lessons #3."
)
for i in "${!ready_titles[@]}"; do
  [[ "$i" -lt "${SKIP_READY_FIRST:-0}" ]] && continue
  num=$(create_issue "${ready_titles[$i]}" "**Source:** TASKLIST.md (Ready — broken down to actionable deliverable)

${ready_bodies[$i]}

---
*Product = amanoba. Status = Ready.*")
  if [[ -n "$num" ]]; then set_board_status "$num" "Ready"; fi
done

# --- 4) Set existing issue #2 (P2 #3 Dashboard) to Ready ---
echo "=== Setting existing issue #2 (P2 #3 Dashboard) to Ready ==="
if [[ -z "$DRY_RUN" ]]; then
  "$SCRIPT_DIR/sovereign-set-project-fields.sh" 2 --status Ready --product amanoba
else
  echo "[DRY-RUN] Would set issue #2 Status=Ready"
fi

echo "Done. Board: https://github.com/users/$OWNER/projects/1"
echo "After verifying, you can deprecate ROADMAP.md and TASKLIST.md in amanoba (see docs/MIGRATION_ROADMAP_TASKLIST.md)."
