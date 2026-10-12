import { createServer, type IncomingMessage } from "node:http";

/** A stand-in for Resend's API: the builder's domains, their DNS records, and the keys it hands out. */

export interface FakeResend {
  url: string;
  domains: Map<string, { id: string; name: string; region: string; status: string }>;
  /** Keys created for Supabase: name → the domain it may send from, and its token. */
  keys: Array<{ name: string; permission: string; domainId: string; token: string }>;
  close(): Promise<void>;
}

const read = (req: IncomingMessage) =>
  new Promise<string>((resolve) => {
    let text = "";
    req.on("data", (c: Buffer) => {
      text += c.toString();
    });
    req.on("end", () => resolve(text));
  });

const RECORDS = (name: string, status: string) => [
  {
    record: "SPF",
    name: "send",
    type: "MX",
    value: "feedback-smtp.us-east-1.amazonses.com",
    priority: 10,
    status,
  },
  {
    record: "SPF",
    name: "send",
    type: "TXT",
    value: '"v=spf1 include:amazonses.com ~all"',
    status,
  },
  {
    record: "DKIM",
    name: "resend._domainkey",
    type: "TXT",
    value: `p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQ${name.replace(/\W/g, "")}IDAQAB`,
    status,
  },
];

export async function startFakeResend(options: {
  /** Keys that may manage domains; others are sending-only. */
  fullKeys: string[];
}): Promise<FakeResend> {
  const domains = new Map<string, { id: string; name: string; region: string; status: string }>();
  const keys: FakeResend["keys"] = [];
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://fake");
    const body = await read(req);
    const send = (status: number, data?: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(data === undefined ? "" : JSON.stringify(data));
    };
    const key = (req.headers.authorization ?? "").replace(/^Bearer /, "");
    if (!options.fullKeys.includes(key)) {
      return keys.some((k) => k.token === key)
        ? send(401, {
            name: "restricted_api_key",
            message: "This API key is restricted to only send emails",
          })
        : send(401, { name: "validation_error", message: "API key is invalid" });
    }
    const full = (d: { id: string; name: string; region: string; status: string }) => ({
      ...d,
      records: RECORDS(d.name, d.status === "verified" ? "verified" : "not_started"),
    });
    if (url.pathname === "/domains" && req.method === "GET") {
      return send(200, { data: [...domains.values()] });
    }
    if (url.pathname === "/domains" && req.method === "POST") {
      const { name, region } = JSON.parse(body) as { name: string; region: string };
      const created = { id: `dom-${domains.size + 1}`, name, region, status: "not_started" };
      domains.set(created.id, created);
      return send(201, full(created));
    }
    const one = url.pathname.match(/^\/domains\/([\w-]+)(\/verify)?$/);
    if (one) {
      const found = domains.get(one[1]!);
      if (!found) return send(404, { message: "Domain not found" });
      if (one[2] && req.method === "POST") {
        if (found.status === "not_started") found.status = "pending";
        return send(200, { object: "domain", id: found.id });
      }
      return send(200, full(found));
    }
    if (url.pathname === "/api-keys" && req.method === "POST") {
      const { name, permission, domain_id } = JSON.parse(body) as {
        name: string;
        permission: string;
        domain_id: string;
      };
      const token = `re_sending_${keys.length + 1}_${"k".repeat(16)}`;
      keys.push({ name, permission, domainId: domain_id, token });
      return send(201, { id: `key-${keys.length}`, token });
    }
    return send(404, { message: `No fake for ${req.method} ${url.pathname}` });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}`,
    domains,
    keys,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
