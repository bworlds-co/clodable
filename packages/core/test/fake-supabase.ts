import { createServer, type IncomingMessage } from "node:http";

/**
 * A stand-in for Supabase: the Management API calls the move makes, and each project's storage.
 * Projects come up after a couple of looks, like real ones. Everything it receives is kept, so tests
 * can check that tokens and passwords only ever went where they should.
 */

export interface FakeProject {
  ref: string;
  name: string;
  region: string;
  organization_slug: string;
  status: string;
  looks: number;
  dbPass?: string;
  storageLimit: number;
  auth?: Record<string, unknown>;
}

export interface FakeSupabase {
  url: string;
  /** For CLODABLE_SUPABASE_PROJECT_URL. */
  projectUrl: string;
  token: string;
  projects: Map<string, FakeProject>;
  /** `${ref}/${bucket}/${name}` → file. */
  files: Map<string, { body: Buffer; type: string }>;
  /** Which buckets are public, per project. */
  publicBuckets: Set<string>;
  secrets: Map<string, Map<string, string>>;
  deployed: Map<
    string,
    Array<{ slug: string; metadata: Record<string, unknown>; files: string[] }>
  >;
  requests: Array<{ method: string; path: string; body: string }>;
  /** What Supabase's security advisor answers, per project. */
  lints: Map<string, Array<Record<string, unknown>>>;
  close(): Promise<void>;
}

const body = (req: IncomingMessage) =>
  new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });

export async function startFakeSupabase(options: {
  token: string;
  /** The ref the next created project gets. */
  nextRef: string;
  /** The old backend's service key, which private downloads need. */
  sourceKey: string;
  organizations?: Array<{ slug: string; name: string; plan: string }>;
  existing?: FakeProject[];
  onUpload?: (ref: string, bucket: string, name: string, size: number, type: string) => void;
}): Promise<FakeSupabase> {
  const organizations = options.organizations ?? [{ slug: "acme", name: "Acme", plan: "free" }];
  const projects = new Map((options.existing ?? []).map((p) => [p.ref, p]));
  const files = new Map<string, { body: Buffer; type: string }>();
  const lints = new Map<string, Array<Record<string, unknown>>>();
  const secrets = new Map<string, Map<string, string>>();
  const deployed = new Map<
    string,
    Array<{ slug: string; metadata: Record<string, unknown>; files: string[] }>
  >();
  const requests: FakeSupabase["requests"] = [];
  const publicBuckets = new Set<string>();
  const keysOf = (ref: string) => [
    { name: "anon", type: "legacy", api_key: `legacy-anon-${ref}` },
    { name: "service_role", type: "legacy", api_key: `legacy-service-${ref}` },
    { name: "default", type: "publishable", api_key: `sb_publishable_${ref}` },
    { name: "default", type: "secret", api_key: `sb_secret_${ref}` },
  ];

  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://fake");
    const raw = await body(req);
    const text = raw.toString("utf8");
    requests.push({ method: req.method ?? "GET", path: url.pathname + url.search, body: text });
    const send = (status: number, data?: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(data === undefined ? "" : JSON.stringify(data));
    };

    // Each project's own storage.
    const storage = url.pathname.match(/^\/project\/([a-z]{20})\/storage\/v1\/object\/(.+)$/);
    if (storage) {
      const ref = storage[1]!;
      const parts = storage[2]!.split("/").map(decodeURIComponent);
      const isPublicPath = parts[0] === "public";
      if (isPublicPath) parts.shift();
      const bucket = parts.shift()!;
      const name = parts.join("/");
      const fileKey = `${ref}/${bucket}/${name}`;
      if (req.method === "POST") {
        if (req.headers.apikey !== `sb_secret_${ref}`) return send(403, { message: "no" });
        const project = projects.get(ref);
        if (project && raw.length > project.storageLimit) return send(413, { message: "too big" });
        const type = String(req.headers["content-type"] ?? "application/octet-stream");
        files.set(fileKey, { body: raw, type });
        options.onUpload?.(ref, bucket, name, raw.length, type);
        return send(200, { Key: `${bucket}/${name}` });
      }
      const file = files.get(fileKey);
      const allowed =
        (isPublicPath && publicBuckets.has(`${ref}/${bucket}`)) ||
        req.headers.apikey === `sb_secret_${ref}` ||
        req.headers.authorization === `Bearer ${options.sourceKey}`;
      if (!allowed || !file) return send(allowed ? 404 : 400, { message: "Object not found" });
      res.writeHead(200, { "content-type": file.type });
      return res.end(file.body);
    }

    if (req.headers.authorization !== `Bearer ${options.token}`) {
      return send(401, { message: "Unauthorized" });
    }
    const path = url.pathname;
    if (path === "/v1/organizations") {
      return send(
        200,
        organizations.map((o) => ({ id: o.slug, slug: o.slug, name: o.name })),
      );
    }
    const org = path.match(/^\/v1\/organizations\/([\w-]+)$/);
    if (org) {
      const found = organizations.find((o) => o.slug === org[1]);
      return found ? send(200, { id: found.slug, name: found.name, plan: found.plan }) : send(404);
    }
    if (path === "/v1/projects" && req.method === "GET") {
      return send(
        200,
        [...projects.values()].map((p) => ({
          id: p.ref,
          ref: p.ref,
          organization_slug: p.organization_slug,
          name: p.name,
          region: p.region,
          status: p.status,
          created_at: "2026-10-11T00:00:00Z",
        })),
      );
    }
    if (path === "/v1/projects/available-regions") {
      const region = { code: "eu-central-1", name: "Central EU (Frankfurt)", type: "specific" };
      return send(200, {
        recommendations: { smartGroup: { code: "emea" }, specific: [region] },
        all: { smartGroup: [], specific: [region] },
      });
    }
    if (path === "/v1/projects" && req.method === "POST") {
      const input = JSON.parse(text) as {
        name: string;
        organization_slug: string;
        db_pass: string;
        region_selection: { code: string };
      };
      const project: FakeProject = {
        ref: options.nextRef,
        name: input.name,
        region: input.region_selection.code,
        organization_slug: input.organization_slug,
        status: "COMING_UP",
        looks: 0,
        dbPass: input.db_pass,
        storageLimit: 50 * 1024 * 1024,
      };
      projects.set(project.ref, project);
      return send(201, { ...project, id: project.ref, created_at: "2026-10-11T00:00:00Z" });
    }
    const match = path.match(/^\/v1\/projects\/([a-z]{20})(\/.*)?$/);
    const project = match ? projects.get(match[1]!) : undefined;
    if (!match || !project) return send(404, { message: "Project not found" });
    const rest = match[2] ?? "";
    if (rest === "") {
      project.looks++;
      if (project.status === "COMING_UP" && project.looks >= 2) project.status = "ACTIVE_HEALTHY";
      return send(200, { ...project, id: project.ref, created_at: "2026-10-11T00:00:00Z" });
    }
    if (rest === "/health") {
      return send(
        200,
        (url.searchParams.get("services") ?? "").split(",").map((name) => ({
          name,
          healthy: true,
          status: "ACTIVE_HEALTHY",
        })),
      );
    }
    if (rest === "/config/database/pooler") {
      return send(200, [
        {
          database_type: "PRIMARY",
          db_user: `postgres.${project.ref}`,
          db_host: "aws-0-eu-central-1.pooler.supabase.com",
          db_port: 6543,
          db_name: "postgres",
          pool_mode: "transaction",
        },
      ]);
    }
    if (rest === "/api-keys") return send(200, keysOf(project.ref));
    if (rest === "/advisors/security" || rest === "/advisors/performance") {
      return send(200, { lints: rest.endsWith("security") ? (lints.get(project.ref) ?? []) : [] });
    }
    if (rest === "/config/auth") {
      project.auth ??= {
        site_url: "http://localhost:3000",
        uri_allow_list: "",
        mailer_autoconfirm: false,
      };
      if (req.method === "PATCH")
        project.auth = { ...project.auth, ...(JSON.parse(text) as object) };
      return send(200, project.auth);
    }
    if (rest === "/config/storage") {
      if (req.method === "PATCH") {
        project.storageLimit = (JSON.parse(text) as { fileSizeLimit: number }).fileSizeLimit;
        return send(200);
      }
      return send(200, { fileSizeLimit: project.storageLimit });
    }
    if (rest === "/secrets") {
      const mine = secrets.get(project.ref) ?? new Map<string, string>();
      secrets.set(project.ref, mine);
      if (req.method === "POST") {
        for (const s of JSON.parse(text) as Array<{ name: string; value: string }>) {
          mine.set(s.name, s.value);
        }
        return send(201);
      }
      return send(
        200,
        [...mine.keys()].map((name) => ({ name, value: "digest" })),
      );
    }
    if (rest === "/functions/deploy" && req.method === "POST") {
      const slug = url.searchParams.get("slug") ?? "";
      // Enough of multipart to see what was sent: the metadata part and the file names.
      const metadata = JSON.parse(
        text.match(/name="metadata"\r\n(?:[^\r\n]*\r\n)*?\r\n([^\r]*)\r\n/)?.[1] ?? "{}",
      ) as Record<string, unknown>;
      const names = [...text.matchAll(/name="file"; filename="([^"]+)"/g)].map((m) => m[1]!);
      const list = deployed.get(project.ref) ?? [];
      list.push({ slug, metadata, files: names });
      deployed.set(project.ref, list);
      return send(201, { id: slug, slug, name: slug, status: "ACTIVE", version: list.length });
    }
    if (rest === "/functions") {
      return send(
        200,
        (deployed.get(project.ref) ?? []).map((d) => ({
          id: d.slug,
          slug: d.slug,
          name: d.slug,
          status: "ACTIVE",
          version: 1,
        })),
      );
    }
    return send(404, { message: `No fake for ${req.method} ${path}` });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}`,
    projectUrl: `http://127.0.0.1:${port}/project/{ref}`,
    token: options.token,
    projects,
    files,
    publicBuckets,
    secrets,
    deployed,
    requests,
    lints,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}
