import { createServer, type IncomingMessage } from "node:http";

/** A stand-in for Netlify's API: the calls putting a site on Netlify makes, and what they received. */

export interface FakeNetlify {
  url: string;
  sites: Map<
    string,
    {
      id: string;
      name: string;
      account: string;
      custom_domain?: string;
      published_deploy?: { state: string; published_at?: string };
    }
  >;
  /** Sites whose certificate was asked for. */
  certificates: Set<string>;
  /** site id → key → value. */
  env: Map<string, Map<string, { value: string; secret: boolean }>>;
  /** Names already taken across Netlify. */
  taken: Set<string>;
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

export async function startFakeNetlify(options: { token: string }): Promise<FakeNetlify> {
  const sites = new Map<
    string,
    {
      id: string;
      name: string;
      account: string;
      custom_domain?: string;
      published_deploy?: { state: string; published_at?: string };
    }
  >();
  const certificates = new Set<string>();
  const env = new Map<string, Map<string, { value: string; secret: boolean }>>();
  const taken = new Set<string>();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://fake");
    const body = await read(req);
    const send = (status: number, data?: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(data === undefined ? "" : JSON.stringify(data));
    };
    if (req.headers.authorization !== `Bearer ${options.token}`) {
      return send(401, { message: "Access Denied" });
    }
    const path = url.pathname.replace(/^\/api\/v1/, "");
    const site = (s: {
      id: string;
      name: string;
      account: string;
      published_deploy?: { state: string; published_at?: string };
    }) => ({
      id: s.id,
      name: s.name,
      url: `http://${s.name}.netlify.app`,
      ssl_url: `https://${s.name}.netlify.app`,
      admin_url: `https://app.netlify.com/sites/${s.name}`,
      account_slug: s.account,
      published_deploy: s.published_deploy,
    });
    if (path === "/user") return send(200, { id: "u1", email: "builder@example.com" });
    if (path === "/accounts") {
      return send(200, [{ id: "a1", slug: "builder-team", name: "Builder's team" }]);
    }
    const create = path.match(/^\/([\w-]+)\/sites$/);
    if (create && req.method === "POST") {
      const { name } = JSON.parse(body) as { name: string };
      if (taken.has(name)) return send(422, { message: "subdomain must be unique" });
      const created = { id: `site-${sites.size + 1}`, name, account: create[1]! };
      sites.set(created.id, created);
      taken.add(name);
      return send(201, site(created));
    }
    const ssl = path.match(/^\/sites\/([\w-]+)\/ssl$/);
    if (ssl && req.method === "POST") {
      certificates.add(ssl[1]!);
      return send(200, { state: "issued" });
    }
    const patchSite = path.match(/^\/sites\/([\w-]+)$/);
    if (patchSite && req.method === "PATCH") {
      const found = sites.get(patchSite[1]!);
      if (!found) return send(404, { message: "Not Found" });
      found.custom_domain = (JSON.parse(body) as { custom_domain?: string }).custom_domain;
      return send(200, site(found));
    }
    const getSite = path.match(/^\/sites\/([\w-]+)$/);
    if (getSite) {
      const found = sites.get(getSite[1]!);
      return found ? send(200, site(found)) : send(404, { message: "Not Found" });
    }
    const envPath = path.match(/^\/accounts\/([\w-]+)\/env(?:\/([A-Z0-9_]+))?$/);
    if (envPath) {
      const siteId = url.searchParams.get("site_id") ?? "";
      const vars = env.get(siteId) ?? new Map<string, { value: string; secret: boolean }>();
      env.set(siteId, vars);
      const key = envPath[2];
      if (req.method === "GET" && !key) {
        return send(
          200,
          [...vars.entries()].map(([k, v]) => ({ key: k, is_secret: v.secret })),
        );
      }
      if (req.method === "POST" && !key) {
        for (const item of JSON.parse(body) as Array<{
          key: string;
          values: Array<{ value: string }>;
          is_secret?: boolean;
        }>) {
          if (vars.has(item.key)) return send(409, { message: "already exists" });
          vars.set(item.key, { value: item.values[0]!.value, secret: Boolean(item.is_secret) });
        }
        return send(201, []);
      }
      if (req.method === "PATCH" && key) {
        const current = vars.get(key);
        if (!current) return send(404, { message: "Not Found" });
        vars.set(key, { ...current, value: (JSON.parse(body) as { value: string }).value });
        return send(200, {});
      }
    }
    return send(404, { message: `No fake for ${req.method} ${path}` });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}/api/v1`,
    sites,
    certificates,
    env,
    taken,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
