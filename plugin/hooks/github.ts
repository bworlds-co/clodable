// GitHub CLI's browser sign-in output. Pure parsing: no processes, account access, or stored keys.

export type GitHubSignInCode = { code: string; copied: boolean };
export type GitHubSignInExit = { code?: number | null; signal?: string | null };
export type GitHubSignInFailure = {
  kind: "expired" | "denied" | "network" | "unknown";
  message: string;
  details: string;
};

const BUFFER_LIMIT = 8192;
const PIECE_LIMIT = 1024;

/** Strip terminal styling after buffering, since an escape sequence may cross chunks too. */
function plain(text: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: terminal output contains ANSI escapes.
  return text.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
}

/**
 * Keep only recognized diagnostic facts, never arbitrary process output. Even an unknown error
 * can contain credentials, URLs with passwords, or the temporary code, so a regex redactor isn't
 * a safe fallback. The exit status and stage still explain an otherwise unrecognized failure.
 */
const FACTS: Array<{
  matches: RegExp;
  detail: string;
  kind?: GitHubSignInFailure["kind"];
}> = [
  {
    matches: /\bexpired_token\b|\b(?:device|authorization) code (?:has |is |was )?expired\b/i,
    detail: "GitHub reported that the device code expired.",
    kind: "expired",
  },
  {
    matches:
      /\baccess_denied\b|\b(?:user denied (?:the )?(?:request|authorization)|authorization (?:was )?denied)\b/i,
    detail: "GitHub reported that authorization was declined.",
    kind: "denied",
  },
  {
    matches:
      /\bENOTFOUND\b|\bEAI_AGAIN\b|\bno such host\b|\b(?:DNS|name) (?:lookup|resolution) failed\b/i,
    detail: "The computer couldn't look up GitHub's address.",
    kind: "network",
  },
  {
    matches:
      /\bECONNREFUSED\b|\bECONNRESET\b|\bENETUNREACH\b|\bconnection (?:refused|reset)\b|\bnetwork (?:is )?unreachable\b/i,
    detail: "The network connection to GitHub failed.",
    kind: "network",
  },
  {
    matches: /\bETIMEDOUT\b|\bi\/o timeout\b|\bTLS handshake timeout\b/i,
    detail: "The network request to GitHub timed out.",
    kind: "network",
  },
  {
    matches:
      /\bx509:|\bcertificate (?:has expired|signed by unknown authority|verify failed)|\bTLS handshake failed\b/i,
    detail: "The secure connection to GitHub couldn't be verified.",
    kind: "network",
  },
  {
    matches: /\bHTTP(?:\/\d(?:\.\d)?)?\s+(?:502|503|504)\b/i,
    detail: "GitHub or a network gateway reported that it was temporarily unavailable.",
    kind: "network",
  },
  {
    matches: /\bENOENT\b|\b(?:executable|command) not found\b/i,
    detail: "The sign-in program couldn't be found on this computer.",
  },
  {
    matches: /\bEACCES\b|\b(?:spawn|exec|open|mkdir|write)\b[^\n]*\bpermission denied\b/i,
    detail:
      "A local permission check prevented the sign-in program from running or saving its settings.",
  },
  {
    matches:
      /\b(?:GH_TOKEN|GITHUB_TOKEN)\b.*\benvironment\b|\benvironment\b.*\b(?:GH_TOKEN|GITHUB_TOKEN)\b/i,
    detail: "GitHub CLI reported an existing sign-in supplied by the environment.",
  },
  {
    matches:
      /\b(?:keyring|keychain|credential store)\b.*\b(?:failed|error|unavailable|could not|couldn't)\b|\b(?:failed|unable) to (?:store|save)\b.*\b(?:credential|token)\b/i,
    detail: "GitHub CLI couldn't use this computer's credential store.",
  },
];

export function githubSignInOutput() {
  const buffers = { stdout: "", stderr: "" };
  const facts = new Set<number>();
  let current: GitHubSignInCode | undefined;
  let copied = false;

  const inspect = (text: string) => {
    for (const [index, fact] of FACTS.entries()) if (fact.matches.test(text)) facts.add(index);
  };

  return {
    /** Streams are kept apart: half a stdout word must not join half a stderr word. */
    push(stream: "stdout" | "stderr", text: string): GitHubSignInCode | undefined {
      let changed: GitHubSignInCode | undefined;
      // Bound retained and intermediate buffers even when a process supplies one enormous chunk.
      for (let offset = 0; offset < text.length; offset += PIECE_LIMIT) {
        buffers[stream] = (buffers[stream] + text.slice(offset, offset + PIECE_LIMIT)).slice(
          -BUFFER_LIMIT,
        );
        const output = plain(buffers[stream]);
        inspect(output);
        copied ||= /\bcopied to (?:the )?clipboard\b/i.test(output);
        const code = current?.code ?? output.match(/\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/)?.[1];
        if (code && (!current || current.copied !== copied)) {
          current = { code, copied };
          changed = { ...current };
        }
      }
      return changed;
    },

    details(): string {
      return [...facts].map((index) => FACTS[index]!.detail).join("\n");
    },

    /** Call only after the caller has independently checked whether an account connected. */
    failure(exit?: GitHubSignInExit, error?: unknown): GitHubSignInFailure {
      const errorText =
        error instanceof Error ? error.message : typeof error === "string" ? error : "";
      // Errors use the same allowlist; neither thrown values nor subprocess output are repeated.
      for (let offset = 0; offset < errorText.length; offset += PIECE_LIMIT)
        inspect(plain(errorText.slice(Math.max(0, offset - PIECE_LIMIT), offset + PIECE_LIMIT)));
      const kinds = [...facts].map((index) => FACTS[index]!.kind);
      const kind = kinds.includes("expired")
        ? "expired"
        : kinds.includes("denied")
          ? "denied"
          : kinds.includes("network")
            ? "network"
            : "unknown";
      const details = [...facts].map((index) => FACTS[index]!.detail);
      if (typeof exit?.code === "number" && Number.isSafeInteger(exit.code)) {
        details.push(`GitHub CLI exited with code ${exit.code}.`);
        if (exit.code === 0)
          details.push("The sign-in command finished, but a connected account wasn't confirmed.");
      } else if (exit?.signal) {
        details.push("The sign-in process was interrupted.");
      } else if (error !== undefined) {
        details.push("The sign-in process couldn't start or finish.");
      } else {
        details.push("The sign-in process didn't report a final exit status.");
      }
      return {
        kind,
        message:
          kind === "expired"
            ? "That GitHub code expired. Try again for a new code."
            : kind === "denied"
              ? "GitHub's connection wasn't approved. Try again when you're ready."
              : kind === "network"
                ? "Clodable couldn't reach GitHub. Check your connection, then try again."
                : "GitHub didn't connect. Try again, or ask Claude for help.",
        details: details.join("\n"),
      };
    },
  };
}
