import { test, expect } from "@playwright/test";

/**
 * AI draft inbox — edit-before-approve + bulk select/reject.
 *
 * Runs against tagged fixtures seeded onto the Acme Co onboarding (id 11) by
 * prisma/seed-ai-test-fixtures.js. All fixtures are create_task drafts, so
 * they render as CreateTaskCards in the "Actions" column.
 */
const ONBOARDING_ID = 11;
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
};

/** Locate a draft card by a substring of its task title. */
function draftCard(page, titleSubstring) {
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
    await expect(createdCard.locator(".task-id").first()).toHaveText(/^AC-\d+$/);
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
});
