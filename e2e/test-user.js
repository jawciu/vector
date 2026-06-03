/**
 * Dedicated Playwright auth identity.
 *
 * A separate, clearly-labelled Supabase auth user so e2e runs never need
 * Caroline's personal password and never mutate her account. Provisioned
 * idempotently via the GoTrue admin API (service-role key) in global setup.
 *
 * To remove it later:
 *   curl -s "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/admin/users/<id>" \
 *     -X DELETE -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
 *     -H "apikey: $SUPABASE_SERVICE_ROLE_KEY"
 * (find <id> by listing /auth/v1/admin/users). Or just leave it — it has no
 * special data and can only see what any vendor user sees.
 */
export const TEST_EMAIL = process.env.E2E_EMAIL || "e2e-playwright@vector.test";
export const TEST_PASSWORD = process.env.E2E_PASSWORD || "vector-e2e-pw-2026";

export async function ensureTestUser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY missing — is .env loaded?"
    );
  }

  const res = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      email_confirm: true,
    }),
  });

  if (res.ok) {
    console.log(`[e2e] provisioned test user ${TEST_EMAIL}`);
    return;
  }

  // Already exists → ensure the password matches what the test will use.
  const body = await res.json().catch(() => ({}));
  const alreadyExists =
    res.status === 422 ||
    /already.*registered|already.*exists|email_exists/i.test(JSON.stringify(body));
  if (!alreadyExists) {
    throw new Error(`Failed to provision test user (${res.status}): ${JSON.stringify(body)}`);
  }

  // Look up the id and reset the password so reruns stay deterministic even
  // if the password constant ever changes.
  const listRes = await fetch(
    `${url}/auth/v1/admin/users?per_page=200`,
    { headers: { Authorization: `Bearer ${key}`, apikey: key } }
  );
  const list = await listRes.json();
  const users = list.users || (Array.isArray(list) ? list : []);
  const existing = users.find((u) => u.email === TEST_EMAIL);
  if (existing) {
    await fetch(`${url}/auth/v1/admin/users/${existing.id}`, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${key}`,
        apikey: key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password: TEST_PASSWORD, email_confirm: true }),
    });
    console.log(`[e2e] reusing test user ${TEST_EMAIL}`);
  }
}
