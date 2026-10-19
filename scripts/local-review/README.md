# Local merge review

Start with `npm run review:local` in this worktree. Port 3010 is reserved for this
review. The existing port 3000 server is untouched.

The script creates a fresh throwaway loopback Postgres, applies all migrations
locally, and seeds five customers from the reviewed golden boards and actual
saved feature-4 run 1 outputs. It accepts no database URL. Normal demo auth is
retained; no auth admin calls or password resets are made. Only the existing
public Supabase/auth and demo sign-in settings are passed to Next. Model, email,
webhook, service-role and production database credentials are not passed.
The DB disappears when the process stops; restart resets the review examples.
No new AI output is generated. AI overview regeneration is unavailable in this
review; use Meetings and Actions to inspect the saved model outputs.

Prepared meeting groups have a visible `Review` label and are for UI/approval testing,
not evidence of model quality. The other meeting groups are real recorded eval
outputs, with IDs mapped to these local boards. Their original meeting/due dates
are preserved, so overdue badges reflect the historical examples.
Keep review labels on meeting headers only; task titles and dependency labels
use plain names. FN-6 is the prepared standalone dependency example.

| Item | Where | Example |
|---|---|---|
| 1: multi-field update | `/onboardings/10?tab=actions` (Ashby) | Meeting `Review 1–2: fields and owner warnings`, update ASH-1. Owner, due date, priority, appended note. |
| 2: remove due date / missing owner | Same Ashby Actions | ASH-2 due-date removal; `Share revised metrics guide` has the unavailable owner warning. |
| 3: several dependencies | `/onboardings/6?tab=tasks&task=26` (Function Health) | Opens FN-6 `Connect warehouse and repo` directly. FN-1, FN-3 and `Security sign-off`. |
| 4: linked draft approval order | `/onboardings/4?tab=actions` (Loop Returns) | Review 4A: prerequisite first. 4B: dependent first. 4C: dismiss prerequisite. Each pair has `Add returns metrics` and `Migrate returns dashboard`. |
| 5: recorder | `/settings#meeting-recorder`, then `/onboardings/3?tab=actions` (Modal) | Settings starts with Maya. Modal's original recorded meeting has her assigned; `Share executive dashboard draft` shows the unmapped-recorder warning. Changing settings affects new processing, not previously stored drafts. |
| 6: actual AI suggestions | Meetings then Actions for Ashby (10), Function Health (6), Loop Returns (4), Modal (3), Flock Freight (7) | Review the unlabelled recorded meeting groups against their full transcripts. |

For the outdated-dependency question: Function Health Actions includes `Review:
outdated dependency suggestion`. It proposes making FN-1 wait for FN-2, which is
already Done. Approval refuses the empty update and leaves the draft pending for
manual dismissal; the underlying FN-1 task still needs doing.

The current app's Insights/follow-up context only exposes the legacy first task
dependency. On FN-6 that means FN-1, while FN-3 and Security sign-off are omitted.
This describes the context limitation; no email or model call is made to demo it.
