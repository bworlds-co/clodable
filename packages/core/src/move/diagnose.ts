import { ClodableError } from "../errors.js";
import type { Workspace } from "../workspace.js";
import { apiSeesTables } from "./copy.js";
import { homeSql, localTarget } from "./home.js";
import { backToPreview, backToSite, liveSignIn, prepareCopySignIn } from "./sign-in.js";
import { loadMove, type MoveCheck } from "./state.js";
import { SupabaseApi } from "./supabase-api.js";
import { verifyCopy } from "./verify.js";
import { count } from "./words.js";

/** One thing looked at: what's true, and the way forward when it isn't. */
export interface MoveFinding extends MoveCheck {
  /** What to do about it, when it isn't fine. */
  fix?: string;
  /** `--fix` just put it right. */
  fixed?: boolean;
}

const LOOK_AGAIN = "Run `clodable move diagnose --fix`.";

/** Fine as it was, put right just now by `--fix`, or what's wrong and the way forward. */
function verdict(
  ok: boolean,
  fixedNow: boolean,
  otherwise: { detail?: string; fix: string },
): Pick<MoveFinding, "detail" | "fix" | "fixed"> {
  if (!ok) return otherwise;
  return fixedNow ? { fixed: true } : {};
}

/**
 * Everything worth knowing about the copy when something seems off, in safe facts only: counts,
 * times, settings and names; never a key, a password or a row. `fix` applies Clodable's own
 * fixes on the copy (its API's list of tables, the preview's sign-in settings); nothing else.
 */
export async function diagnoseCopy(
  ws: Workspace,
  options: { fix?: boolean } = {},
): Promise<{ findings: MoveFinding[] }> {
  const state = await loadMove(ws.root);
  if (!state.home) {
    throw new ClodableError({
      code: "move-not-ready",
      message: "There's no new backend to look at yet.",
      hint: "Create it first: it's an early step of the move.",
    });
  }
  const api = await SupabaseApi.required();
  const ref = state.home.ref;
  const findings: MoveFinding[] = [];

  // An unavailable account or project is not a paused backend. Keep the API's specific
  // explanation and next step instead of turning every failed lookup into a false diagnosis.
  const project = await api.project(ref);
  const running = project?.status === "ACTIVE_HEALTHY";
  findings.push({
    id: "running",
    ok: running,
    label: running
      ? "Your new backend is running"
      : project.status === "INACTIVE" || project.status === "GOING_DOWN"
        ? "Your new backend is paused"
        : "Your new backend isn't ready yet",
    ...(running
      ? {}
      : {
          fix:
            project.status === "INACTIVE" || project.status === "GOING_DOWN"
              ? "Restore it on its page in Supabase, then look again."
              : "Check its status in Supabase, then look again in a minute.",
        }),
  });
  if (!running) return { findings };
  const sql = homeSql(api, ref);

  if (state.export && !localTarget()) {
    const check = await apiSeesTables(api, sql, ref, state.export.summary, {
      refresh: Boolean(options.fix),
    });
    findings.push({
      ...check,
      ...verdict(check.ok, Boolean(options.fix), {
        fix: "Run `clodable move diagnose --fix`: it asks the API to refresh its list of tables.",
      }),
    });
  }

  const auth = await api.authConfig(ref);
  const goesTo = String(auth.site_url ?? "Supabase's default");
  const site = state.switch?.liveAt ? state.site?.url : undefined;
  if (site) {
    // Live: sign-in links go to the site. Whether people confirm their email was the builder's
    // choice when going live, so it's left alone.
    const comesBack = backToSite(auth, site);
    if (!comesBack && options.fix) await liveSignIn(api, ref, site);
    const ok = comesBack || Boolean(options.fix);
    findings.push({
      id: "sign-in",
      ok,
      label: ok
        ? "Sign-in links come back to your site"
        : "Sign-in links don't come back to your site",
      ...verdict(ok, !comesBack, { detail: `they go to ${goesTo}`, fix: LOOK_AGAIN }),
    });
  } else {
    const comesBack = backToPreview(auth);
    const noEmailWait = auth.mailer_autoconfirm === true;
    const fixedNow = (!comesBack || !noEmailWait) && Boolean(options.fix);
    if (fixedNow) await prepareCopySignIn(api, ref);
    const ok = (comesBack && noEmailWait) || fixedNow;
    findings.push({
      id: "sign-in",
      ok,
      label: ok
        ? "The preview can sign people in on the copy"
        : "Sign-ins on the copy don't come back to the preview",
      ...verdict(ok, fixedNow, {
        detail: [
          comesBack ? "" : `sign-in links go to ${goesTo}`,
          noEmailWait
            ? ""
            : "new people must confirm by email, which Supabase's test mailer rarely sends",
        ]
          .filter(Boolean)
          .join("; "),
        fix: LOOK_AGAIN,
      }),
    });
  }

  const [people] = await sql.rows<{
    people: number;
    last_signup: string | null;
    last_sign_in: string | null;
  }>(
    "select count(*)::int as people, max(created_at)::text as last_signup, max(last_sign_in_at)::text as last_sign_in from auth.users",
  );
  findings.push({
    id: "people",
    ok: true,
    label: `${count(Number(people?.people ?? 0), "person", "people")} on the copy`,
    detail: `last sign-up ${people?.last_signup?.slice(0, 19) ?? "never"}, last sign-in ${people?.last_sign_in?.slice(0, 19) ?? "never"} (UTC)`,
  });

  if (state.export) {
    const checks = await verifyCopy(sql, state.export.summary, {
      ...(state.source ? { sourceRef: state.source.ref } : {}),
      files: Boolean(state.files),
      exact: false,
    });
    const failing = checks.filter((c) => !c.ok);
    if (failing.length === 0) {
      findings.push({ id: "data", ok: true, label: "Your data's checks pass" });
    } else {
      findings.push(
        ...failing.map((c) => ({
          ...c,
          fix: "Copying again from a fresh export usually puts it right.",
        })),
      );
    }
  }
  if (state.data && state.data.problems.length > 0) {
    findings.push({
      id: "copy-notes",
      ok: true,
      label: `The copy noted ${count(state.data.problems.length, "message")} from Postgres`,
      detail: state.data.problems.slice(0, 5).join("; "),
    });
  }
  findings.push({
    id: "preview",
    ok: true,
    label:
      state.preview === "copy"
        ? "The preview uses the copy"
        : "The preview uses your live data (on Lovable Cloud)",
  });
  return { findings };
}
