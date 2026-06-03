import { test, expect } from "@playwright/test";

/**
 * Task ID integrity + "chips render everywhere".
 *
 * Acme Co onboarding (id 11, prefix AC) — resolved by the fixture seed,
 * which prints `onboardingId` if it ever drifts.
 */
const ONBOARDING_ID = 11;
const ID_RE = /^[A-Z][A-Z0-9]{1,4}-\d+$/;

test.describe("Task ID chips", () => {
  test("every task card on the board has a well-formed, unique ID chip", async ({ page }) => {
    await page.goto(`/onboardings/${ONBOARDING_ID}?tab=tasks`);

    const cards = page.locator("[data-task-card]");
    await expect(cards.first()).toBeVisible();
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    const ids = [];
    for (let i = 0; i < count; i++) {
      // A card's own ID is the first .task-id in it (a later one would be a
      // "blocked by" dependency reference, which is allowed to repeat).
      const chip = cards.nth(i).locator(".task-id").first();
      await expect(chip).toBeVisible();
      const text = (await chip.innerText()).trim();
      expect(text, `card ${i} chip "${text}" should match ${ID_RE}`).toMatch(ID_RE);
      expect(text.startsWith("AC-"), `card ${i} should be an AC- id`).toBeTruthy();
      ids.push(text);
    }

    // No two tasks share an ID.
    expect(new Set(ids).size, `duplicate IDs found in: ${ids.join(", ")}`).toBe(ids.length);
  });

  test("the task drawer also shows the ID chip", async ({ page }) => {
    await page.goto(`/onboardings/${ONBOARDING_ID}?tab=tasks`);
    await expect(page.locator("[data-task-card]").first()).toBeVisible();

    // Click the card body to open the drawer (the title span, not the checkbox).
    await page.locator("[data-task-card]").first().locator("span", { hasText: /.+/ }).first().click();

    // The drawer renders the chip inside the title <h2>.
    const drawerChip = page.locator("h2 .task-id");
    await expect(drawerChip).toBeVisible();
    await expect(drawerChip).toHaveText(ID_RE);
  });
});
