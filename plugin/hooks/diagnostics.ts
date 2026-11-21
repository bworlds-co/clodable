// Local tool failures can include proxy passwords or environment credentials. Share facts only.

const FACTS: Array<[RegExp, string]> = [
  [
    /\bchecksum (?:mismatch|failed|invalid)\b|\b(?:didn't|doesn't|did not|does not|not) match (?:its |the |expected )?checksum\b|\b(?:invalid|mismatched) checksum\b|\bSHA-?256 mismatch\b/i,
    "The downloaded file didn't match its expected checksum.",
  ],
  [
    /\bunsupported proxy syntax\b|\binvalid proxy\b/i,
    "The computer's proxy configuration is invalid.",
  ],
  [
    /\bcould not resolve proxy\b|\bproxy authentication (?:required|failed)\b|\bHTTP\s+407\b/i,
    "The configured proxy couldn't be reached or authenticated.",
  ],
  [
    /\bENOTFOUND\b|\bEAI_AGAIN\b|\bno such host\b|\bcould not resolve host\b/i,
    "The computer couldn't look up the download server's address.",
  ],
  [
    /\bECONNREFUSED\b|\bECONNRESET\b|\bENETUNREACH\b|\bconnection (?:refused|reset)\b|\bnetwork (?:is )?unreachable\b|\bfailed to connect\b/i,
    "The network connection failed.",
  ],
  [
    /\bETIMEDOUT\b|\bi\/o timeout\b|\b(?:connection|operation|request) timed out\b|\bTLS handshake timeout\b/i,
    "The network request timed out.",
  ],
  [
    /\bx509:|\bcertificate\b.*\b(?:expired|invalid|unknown|failed|verify|unable)\b|\bSSL peer certificate\b|\bTLS handshake failed\b/i,
    "The secure connection couldn't be verified.",
  ],
  [
    /\bHTTP(?:\/\d(?:\.\d)?)?\s+(?:429|502|503|504)\b|\bserver answered (?:429|502|503|504)\b/i,
    "The download server or a gateway is temporarily unavailable or limiting requests.",
  ],
  [
    /\bEACCES\b|\bEPERM\b|\bpermission denied\b|\boperation not permitted\b/i,
    "A local permission prevented the tool operation.",
  ],
  [
    /\bENOENT\b|\b(?:command|executable) not found\b|\bno such file or directory\b/i,
    "A required program or file couldn't be found.",
  ],
  [
    /\bNo (?:Node\.js|GitHub CLI|gitleaks) (?:download|build)\b|\bautomatic preparation is unavailable\b|\bunsupported (?:platform|system|architecture)\b/i,
    "Automatic tool preparation isn't available for this system or architecture.",
  ],
  [
    /\bNo supported Node\.js\b|\bNode\.js is unavailable\b|\bNode\.js (?:is )?too old\b/i,
    "A supported Node.js runtime wasn't available.",
  ],
  [
    /\bdownloaded Node\.js could not run\b|\bbad CPU type\b|\bexec format error\b|\bnot a valid Win32 application\b|\bwrong architecture\b/i,
    "The downloaded program couldn't run on this computer.",
  ],
  [
    /\bPATH couldn't be read\b|\bPATH could not be read\b/i,
    "The session's program search path couldn't be read; it was left unchanged.",
  ],
  [
    /\binvalid active developer path\b|\bno developer tools were found\b|\bactive developer directory\b.*\b(?:invalid|missing)\b/i,
    "Apple's command line tools are missing or aren't selected correctly.",
  ],
  [
    /\bcommand line tools are already installed\b/i,
    "Apple reports that its command line tools are already installed.",
  ],
  [
    /\b(?:Xcode|Apple|developer tools)\b.*\blicen[cs]e\b.*\b(?:not|must|required|acceptance)\b|\b(?:not agreed|must accept|review and agree)\b.*\blicen[cs]e\b/i,
    "Apple's developer tools require their license to be reviewed on this computer.",
  ],
  [
    /\b(?:couldn't|could not|unable to)\b.*\b(?:unpack|extract)\b|\bunexpected (?:EOF|end of file)\b|\btruncated (?:archive|download)\b/i,
    "The download couldn't be fully unpacked.",
  ],
  [
    /\b(?:check|probe|preparation) (?:didn't|couldn't|could not) (?:finish|run)\b|\bincomplete\b.*\b(?:check|report)\b|\bmissing\b.*\b(?:required checks|prerequisite)\b|\binvalid\b.*\b(?:doctor|check) (?:response|report)\b/i,
    "The readiness check didn't return a complete usable result.",
  ],
  [
    /\b(?:probe|git --version)\b.*\b(?:failed|couldn't|could not|did not|unusable)\b|\bGit (?:isn't|is not|wasn't) usable\b/i,
    "A required program failed its readiness check.",
  ],
  [
    /\bSIG(?:TERM|KILL|INT)\b|\b(?:download|process) (?:was )?(?:interrupted|cancelled|canceled)\b/i,
    "The tool operation was interrupted before it finished.",
  ],
];
const KNOWN_FACTS = new Set(FACTS.map(([, fact]) => fact));

/** A bounded, credential-free explanation for Claude's local repair request; never raw output. */
export function safeToolDetails(text: string): string {
  const facts = new Set<string>();
  for (let offset = 0; offset < text.length; offset += 4096) {
    const piece = text.slice(Math.max(0, offset - 512), offset + 4096);
    for (const line of piece.split(/\r?\n/))
      if (KNOWN_FACTS.has(line.trim())) facts.add(line.trim());
    for (const [pattern, fact] of FACTS) if (pattern.test(piece)) facts.add(fact);
    for (const match of piece.matchAll(
      /\b(?:exit(?:ed)?(?:\s+with)?(?:\s+code)?|exitCode)\s*[:=]?\s*(-?\d{1,10})\b/gi,
    )) {
      const code = Number(match[1]);
      if (code >= -1 && code <= 4294967295) facts.add(`The tool reported exit code ${code}.`);
    }
    for (const match of piece.matchAll(/\bcurl(?: error |:\s*\()(\d{1,2})\)?/g))
      facts.add(`The downloader reported curl error ${Number(match[1])}.`);
    // Even pathological output listing many different exit codes has bounded diagnostic output.
    if (facts.size >= 24) break;
  }
  return (
    [...facts].slice(0, 24).join("\n") ||
    "The tool reported an unrecognized failure. No raw output was included."
  );
}
