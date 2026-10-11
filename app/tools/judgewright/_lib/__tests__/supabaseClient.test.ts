import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The env-gated auth path.
 *
 * Unset keys ⇒ a null no-op: no bootstrap, no listeners, zero backend
 * connections, and the tool fully usable. Set keys ⇒ a lazily imported
 * singleton (the SDK is a heavy dynamic import so it never lands in First
 * Load JS).
 */

type SupabaseModule = typeof import("../supabaseClient");

const DEMO_URL = "https://demo-project.supabase.co";
const DEMO_KEY = "demo-anon-key";

/** Loads a fresh copy of the module with the env exactly as given. */
async function loadModule(): Promise<SupabaseModule> {
  vi.resetModules();
  return import("../supabaseClient");
}

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
});

describe("unconfigured project — the default state", () => {
  it("reports auth as disabled", async () => {
    const supabase = await loadModule();
    expect(supabase.isSupabaseConfigured).toBe(false);
  });

  it("never builds a client, so nothing can connect", async () => {
    const supabase = await loadModule();
    await expect(supabase.getSupabaseClient()).resolves.toBeNull();
  });

  it("stays null across repeated calls", async () => {
    const supabase = await loadModule();
    await expect(supabase.getSupabaseClient()).resolves.toBeNull();
    await expect(supabase.getSupabaseClient()).resolves.toBeNull();
  });
});

describe("configured project", () => {
  it("builds a lazily imported singleton", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = DEMO_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = DEMO_KEY;

    const supabase = await loadModule();

    expect(supabase.isSupabaseConfigured).toBe(true);
    await expect(supabase.getSupabaseClient()).resolves.not.toBeNull();
    // Memoized: both awaits resolve to the SAME instance (no duplicate
    // GoTrueClient warnings).
    const first = await supabase.getSupabaseClient();
    expect(await supabase.getSupabaseClient()).toBe(first);
  });

  it("treats a half-configured project as unconfigured", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = DEMO_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    const supabase = await loadModule();

    expect(supabase.isSupabaseConfigured).toBe(false);
    await expect(supabase.getSupabaseClient()).resolves.toBeNull();
  });

  it("drops the memo on reset", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = DEMO_URL;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = DEMO_KEY;

    const supabase = await loadModule();
    const first = await supabase.getSupabaseClient();
    expect(first).not.toBeNull();

    supabase.resetSupabaseClientCache();
    // A fresh instance, not the memoized one.
    expect(await supabase.getSupabaseClient()).not.toBe(first);
  });
});
