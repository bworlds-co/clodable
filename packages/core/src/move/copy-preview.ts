import { ClodableError } from "../errors.js";
import type { Workspace } from "../workspace.js";
import { backendOf, type PreviewBackend } from "./backend.js";
import { homeKeys } from "./home.js";
import { prepareCopySignIn } from "./sign-in.js";
import { loadMove, updateMove } from "./state.js";
import { SupabaseApi } from "./supabase-api.js";

/** Trying the app on the copy: the preview talks to the new backend instead of Lovable Cloud. */

/** Point the preview at the copy, or back at the live backend. Takes effect when it restarts. */
export async function setPreview(ws: Workspace, target: "live" | "copy"): Promise<void> {
  const state = await loadMove(ws.root);
  if (target === "copy" && !state.data) {
    throw new ClodableError({
      code: "move-not-ready",
      message: "Copy your data first: the preview would show an empty app.",
    });
  }
  // Once live, the app's own settings use the new backend: there's nothing left to choose.
  if (state.switch?.liveAt) return;
  // Copies made before this setting existed get it now (it's idempotent).
  if (target === "copy" && state.home) {
    const api = await SupabaseApi.required();
    await prepareCopySignIn(api, state.home.ref).catch(() => {});
  }
  await updateMove(ws.root, (s) => {
    s.preview = target;
  });
}

/**
 * What the dev server needs to talk to the copy instead of Lovable Cloud: its address and keys,
 * fetched fresh (the secret key only ever lives in the dev server's memory). Undefined when the
 * preview uses the live backend. Throws when the copy is wanted but its keys can't be had: better
 * no preview than one that quietly shows live data.
 */
export async function previewBackend(root: string): Promise<PreviewBackend | undefined> {
  const state = await loadMove(root);
  if (state.preview !== "copy" || !state.home) return undefined;
  const api = await SupabaseApi.required();
  return {
    ...(state.source ? { from: state.source.ref } : {}),
    ...backendOf(state.home.ref, await homeKeys(api, state.home.ref)),
  };
}
