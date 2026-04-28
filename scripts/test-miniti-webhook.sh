#!/bin/bash
# Smoke test for the Miniti webhook receiver.
# Usage: ./scripts/test-miniti-webhook.sh [URL]
# Defaults to http://localhost:3000. Reads MINITI_WEBHOOK_TOKEN from .env.

set -e

BASE_URL="${1:-http://localhost:3000}"
ENDPOINT="$BASE_URL/api/integrations/miniti/webhook"

if [ ! -f .env ]; then
  echo "Error: .env not found. Run from project root."
  exit 1
fi

TOKEN=$(grep -E '^MINITI_WEBHOOK_TOKEN=' .env | cut -d= -f2- | tr -d '"' | tr -d "'")

if [ -z "$TOKEN" ]; then
  echo "Error: MINITI_WEBHOOK_TOKEN not set in .env"
  echo "Generate one with: echo \"MINITI_WEBHOOK_TOKEN=\\\"\$(openssl rand -hex 32)\\\"\" >> .env"
  exit 1
fi

# Generate a fresh meeting.id each run so we don't dedup.
MEETING_ID=$(uuidgen | tr '[:lower:]' '[:upper:]')
TODAY=$(date -u +%Y-%m-%dT%H:%M:%SZ)

echo "→ POST $ENDPOINT"
echo "  meeting.id = $MEETING_ID"
echo

curl -s -X POST "$ENDPOINT?token=$TOKEN" \
  -H "Content-Type: application/json" \
  -d @- <<JSON | python3 -m json.tool
{
  "event": "meeting.saved",
  "meeting": {
    "id": "$MEETING_ID",
    "title": "Acme Co weekly onboarding sync",
    "date": "$TODAY",
    "duration_seconds": 1842,
    "language": "en",
    "summary": "Reviewed integration progress. Acme team will deliver SSO metadata by Friday and confirmed kickoff for legal review next week.",
    "action_items": [
      "Send the revised SSO metadata to Caroline by Friday",
      "Schedule the legal review kickoff for next Tuesday",
      "Loop in Bob on the data migration spec"
    ],
    "key_decisions": [
      "Defer pricing tier discussion until after legal review"
    ],
    "topics": ["sso", "legal", "data migration"],
    "discussion_flow": ["status update", "action items", "next steps"],
    "notes": "Customer team is engaged and responsive.",
    "speaker_count": 2,
    "transcript": [
      {"speaker": "You", "text": "Thanks for joining today.", "timestamp": 0.0},
      {"speaker": "Bob Acme", "text": "Of course — let's get started.", "timestamp": 3.4}
    ],
    "attendees": [
      {"email": "caroline@vector.com", "name": "Caroline", "domain": "vector.com"},
      {"email": "bob@acme.com", "name": "Bob Acme", "domain": "acme.com"}
    ]
  }
}
JSON

echo
echo "→ Now visit $BASE_URL/ai-drafts to see the drafts (orchestrator runs in the background)."
echo "  Wait ~5-10s for Claude to process before refreshing."
