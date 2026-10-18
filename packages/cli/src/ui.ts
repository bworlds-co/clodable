import type { CloclodEvent, ErrorInfo, LogEvent, StepEvent } from "@clodable/core";
import pc from "picocolors";

/**
 * Terminal output in Cloclod's voice. Two modes:
 * - pretty: a short story of steps, a spinner on the running one, then a clear ending;
 * - json: one event per line (NDJSON) for programs such as the Claude mod.
 */

const color = pc.isColorSupported;
const rgb = (r: number, g: number, b: number) => (s: string) =>
  color ? `\u001b[38;2;${r};${g};${b}m${s}\u001b[39m` : s;

export const clay = rgb(201, 96, 60);
export const celadon = rgb(76, 166, 128);
export const ochre = rgb(214, 162, 72);
export const oxide = rgb(226, 98, 86);
export const ash = pc.dim;

const SYMBOLS = {
  done: celadon("✓"),
  warning: ochre("!"),
  failed: oxide("✕"),
  skipped: ash("–"),
  pending: ash("·"),
};
const FRAMES = ["◐", "◓", "◑", "◒"];

export interface Output {
  json: boolean;
  event(event: StepEvent | LogEvent): void;
  result(ok: boolean, data?: unknown, error?: ErrorInfo): void;
  header(title: string): void;
  line(text?: string): void;
  close(): void;
}

export function createOutput(options: { json: boolean; stream?: NodeJS.WriteStream }): Output {
  const out = options.stream ?? process.stdout;
  if (options.json) {
    const write = (event: CloclodEvent) => out.write(`${JSON.stringify(event)}\n`);
    return {
      json: true,
      event: write,
      result: (ok, data, error) =>
        write({
          type: "result",
          ok,
          ...(data !== undefined ? { data } : {}),
          ...(error ? { error } : {}),
        }),
      header: () => {},
      line: () => {},
      close: () => {},
    };
  }

  const tty = Boolean(out.isTTY);
  let spinning:
    | { title: string; detail?: string; frame: number; timer?: NodeJS.Timeout }
    | undefined;

  const clear = () => {
    if (tty && spinning) out.write("\r\u001b[2K");
  };
  const stopSpin = () => {
    if (!spinning) return;
    if (spinning.timer) clearInterval(spinning.timer);
    clear();
    spinning = undefined;
  };
  const drawSpin = () => {
    if (!spinning) return;
    const frame = clay(FRAMES[spinning.frame % FRAMES.length]!);
    const detail = spinning.detail ? ash(`  ${spinning.detail}`) : "";
    out.write(`\r\u001b[2K  ${frame} ${spinning.title}…${detail}`);
  };

  return {
    json: false,
    event(event) {
      if (event.type === "log") {
        stopSpin();
        const mark =
          event.level === "error" ? oxide("✕") : event.level === "warn" ? ochre("!") : ash("›");
        out.write(`  ${mark} ${ash(event.message)}\n`);
        return;
      }
      if (event.state === "running") {
        if (!tty) {
          if (!spinning || spinning.title !== event.title)
            out.write(`  ${ash("…")} ${event.title}\n`);
          spinning = { title: event.title, frame: 0 };
          return;
        }
        if (spinning) {
          spinning.title = event.title;
          if (event.detail) spinning.detail = event.detail;
          else delete spinning.detail;
          drawSpin();
          return;
        }
        spinning = {
          title: event.title,
          frame: 0,
          timer: setInterval(() => {
            if (spinning) {
              spinning.frame++;
              drawSpin();
            }
          }, 120),
          ...(event.detail ? { detail: event.detail } : {}),
        };
        drawSpin();
        return;
      }
      stopSpin();
      // "checks" summarizes its sub-steps, which were already shown one by one.
      if (event.id === "checks" && event.state === "done") return;
      const symbol = SYMBOLS[event.state as keyof typeof SYMBOLS] ?? SYMBOLS.pending;
      const detail = event.detail ? `  ${ash(event.detail)}` : "";
      out.write(
        `  ${symbol} ${event.state === "failed" ? pc.bold(event.title) : event.title}${detail}\n`,
      );
    },
    result(ok, _data, error) {
      stopSpin();
      if (!ok && error) {
        out.write(`\n  ${oxide("✕")} ${pc.bold(error.message)}\n`);
        if (error.hint) out.write(`\n    ${error.hint}\n`);
        if (error.files?.length)
          out.write(`\n    ${ash(error.files.slice(0, 6).join("\n    "))}\n`);
        if (error.details && process.env.CLODABLE_VERBOSE)
          out.write(`\n${ash(indent(error.details, 4))}\n`);
        else if (error.details)
          out.write(`\n    ${ash("Run again with CLODABLE_VERBOSE=1 for the details.")}\n`);
        out.write("\n");
      }
    },
    header(title) {
      out.write(`\n  ${clay("●")} ${pc.bold("cloclod")} ${ash("·")} ${title}\n\n`);
    },
    line(text = "") {
      stopSpin();
      out.write(text ? `  ${text}\n` : "\n");
    },
    close: stopSpin,
  };
}

export function indent(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((l) => pad + l)
    .join("\n");
}

export const label = (text: string) => ash(text.padEnd(11));
export const link = (url: string) => (color ? pc.underline(url) : url);
