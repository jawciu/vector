import { test, expect, type Page } from "@playwright/test";
import { loadTarget } from "./target";

/**
 * AI draft inbox — edit-before-approve + bulk select/reject.
 *
 * Runs against tagged fixtures seeded by prisma/seed-ai-test-fixtures.js onto
 * the onboarding it resolved (see e2e/target.js). Most fixtures are
 * create_task drafts (CreateTaskCards in the "Actions" column); one is a
 * multi-field match_existing update of a fixture task (DraftCard).
 */
const { onboardingId: ONBOARDING_ID, prefix: PREFIX } = loadTarget();
const ACTIONS_URL = `/onboardings/${ONBOARDING_ID}?tab=actions`;

const T = {
  edit: "Draft security questionnaire response",
  edited: "[PWTEST] EDITED security questionnaire response",
  bulk: [
    "Bulk reject candidate A",
    "Bulk reject candidate B",
    "Bulk reject candidate C",
  ],
  control: "Control draft (never touched)",
  updateTarget: "Update target task",
};

/** Mirrors UPDATE_FIXTURE in prisma/seed-ai-test-fixtures.js. */
const UPDATE = {
  originalNotes: "Original note written on the board.",
  appendNotes: "Scope agreed on the call: billing reports only.",
  stamp: "2026-06-18, call with fixture",
};

/** Locate a draft card by a substring of its task title. */
function draftCard(page: Page, titleSubstring: string) {
  return page.locator(".draft-card", { hasText: titleSubstring });
}

test.describe("AI draft inbox", () => {
  test("edit-before-approve applies the edited title to the created task", async ({ page }) => {
    await page.goto(ACTIONS_URL);

    const card = draftCard(page, T.edit);
    await expect(card).toBeVisible();

    // Open the inline edit form.
    await card.getByRole("button", { name: "Edit task" }).click();

    // Once editing, the card's title text changes as we type — so we can no
    // longer locate it by the original title. The editing card is the only one
    // with an "Exit edit" button, so pin it by that instead.
    const editingCard = page.locator(".draft-card", {
      has: page.getByRole("button", { name: "Exit edit" }),
    });
    const titleInput = editingCard.getByLabel("Title");
    await expect(titleInput).toBeVisible();
    await titleInput.fill(T.edited);
    await editingCard.getByRole("button", { name: "Create task" }).click();

    // On success the inbox removes the draft from the pending list.
    await expect(draftCard(page, "security questionnaire response")).toHaveCount(0);

    // The created task carries the EDITED title (proves the override applied)
    // and gets its own ID chip on the board.
    await page.goto(`/onboardings/${ONBOARDING_ID}?tab=tasks`);
    const createdCard = page.locator("[data-task-card]", { hasText: T.edited });
    await expect(createdCard).toBeVisible();
    await expect(createdCard.locator(".task-id").first()).toHaveText(new RegExp(`^${PREFIX}-\\d+$`));
  });

  test("bulk select + reject removes exactly the selected drafts", async ({ page }) => {
    await page.goto(ACTIONS_URL);

    // All three bulk fixtures are present to start.
    for (const title of T.bulk) {
      await expect(draftCard(page, title)).toBeVisible();
    }

    // Select each via its per-card checkbox.
    for (const title of T.bulk) {
      await draftCard(page, title).getByRole("checkbox").click();
    }

    // The bulk action bar reflects the selection count.
    await expect(page.getByText(/\b3 selected\b/)).toBeVisible();

    // Reject the selection.
    await page.getByRole("button", { name: "Reject selected" }).click();

    // All three selected drafts are gone.
    for (const title of T.bulk) {
      await expect(draftCard(page, title)).toHaveCount(0);
    }

    // The unselected control fixture is unaffected — still pending.
    await expect(draftCard(page, T.control)).toBeVisible();
  });

  test("approving a multi-field update applies every change in one go and appends the note", async ({ page }) => {
    await page.goto(ACTIONS_URL);

    const card = draftCard(page, T.updateTarget);
    await expect(card).toBeVisible();

    // The card shows the update as a before → after list, one row per field,
    // plus the note it would add.
    const changes = card.getByRole("list", { name: "Proposed changes" });
    await expect(changes.getByRole("listitem")).toHaveCount(2);
    await expect(changes).toContainText("Due date");
    await expect(changes).toContainText("Priority");
    await expect(changes).toContainText("High");
    await expect(card).toContainText("Adds note");
    await expect(card).toContainText(UPDATE.appendNotes);

    const approved = page.waitForResponse(
      (r) => r.url().includes("/api/ai-drafts/") && r.url().endsWith("/approve")
    );
    await card.getByRole("button", { name: "Approve" }).click();
    const res = await approved;
    expect(res.status()).toBe(200);

    // The draft leaves the pending list.
    await expect(draftCard(page, T.updateTarget)).toHaveCount(0);

    // On the board, the task's notes kept what was there and gained the
    // agreed note on its own stamped line (appended, never overwritten).
    await page.goto(`/onboardings/${ONBOARDING_ID}?tab=tasks`);
    const taskCard = page.locator("[data-task-card]", { hasText: T.updateTarget });
    await expect(taskCard).toBeVisible();
    await taskCard.locator("span", { hasText: T.updateTarget }).first().click();
    const notes = page.getByPlaceholder("Write your notes here");
    // Stamped with the meeting's day and source, not the approval date.
    await expect(notes).toHaveValue(`${UPDATE.originalNotes}\n[${UPDATE.stamp}] ${UPDATE.appendNotes}`);
  });
});
