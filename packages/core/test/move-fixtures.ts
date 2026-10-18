import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32, deflateRawSync } from "node:zlib";

/**
 * A small Lovable Cloud app and a fresh Supabase project, on a local PostgreSQL 18: what the move's
 * tests copy from and into. Skipped where no PostgreSQL 18 is installed.
 */

export const SRC = "srcsrcsrcsrcsrcsrcsr";
export const DST = "dstdstdstdstdstdstds";

/** A JWT shaped like Supabase's keys: only the payload matters here. */
export const jwt = (ref: string, role: string) =>
  [
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify({ iss: "supabase", ref, role })).toString("base64url"),
    "c2lnbmF0dXJl",
  ].join(".");

/** A zip by hand: stored or deflated entries, the central directory, the end record. */
export function makeZip(files: Array<{ name: string; data: Buffer; deflate?: boolean }>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const body = file.deflate ? deflateRawSync(file.data) : file.data;
    const name = Buffer.from(file.name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(file.deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc32(file.data), 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(file.deflate ? 8 : 0, 10);
    central.writeUInt32LE(crc32(file.data), 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, name, body);
    centrals.push(central, name);
    offset += 30 + name.length + body.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

function postgresBin(): string | undefined {
  const candidates = [
    process.env.CLODABLE_TEST_PG_BIN,
    (() => {
      try {
        return execFileSync("pg_config", ["--bindir"], { encoding: "utf8" }).trim();
      } catch {
        return undefined;
      }
    })(),
    "/opt/homebrew/opt/postgresql@18/bin",
    "/usr/lib/postgresql/18/bin",
  ];
  for (const bin of candidates) {
    if (!bin || !existsSync(join(bin, "initdb")) || !existsSync(join(bin, "pg_restore"))) continue;
    const version = spawnSync(join(bin, "pg_dump"), ["--version"], { encoding: "utf8" }).stdout;
    if (/\b(1[89]|[2-9]\d)\./.test(version)) return bin;
  }
  return undefined;
}

export const PG_BIN = postgresBin();

export const freePort = () =>
  new Promise<number>((resolve) => {
    const server = createServer();
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address() as { port: number };
      server.close(() => resolve(port));
    });
  });

/** What a fresh Supabase project already has: sign-ins, files, jobs, vault, roles. */
export const SUPABASE_BASE = `
do $$ begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
create schema extensions;
create extension pgcrypto with schema extensions;
create schema auth;
create table auth.users (instance_id uuid, id uuid primary key, aud text, role text, email text, encrypted_password text, email_confirmed_at timestamptz, last_sign_in_at timestamptz, raw_user_meta_data jsonb, created_at timestamptz default now(), updated_at timestamptz);
create table auth.identities (id uuid primary key default gen_random_uuid(), provider_id text not null, user_id uuid not null references auth.users(id) on delete cascade, identity_data jsonb, provider text not null, created_at timestamptz default now());
create table auth.sessions (id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz default now());
create table auth.refresh_tokens (instance_id uuid, id bigserial primary key, token varchar(255), user_id varchar(255), revoked boolean, session_id uuid references auth.sessions(id) on delete cascade, created_at timestamptz default now());
create table auth.schema_migrations (version varchar(255) primary key);
insert into auth.schema_migrations values ('20240101000000');
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $f$;
create schema storage;
create table storage.buckets (id text primary key, name text not null, owner uuid, public boolean default false, file_size_limit bigint, allowed_mime_types text[], created_at timestamptz default now(), updated_at timestamptz default now());
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets(id), name text, owner uuid, owner_id text, metadata jsonb, created_at timestamptz default now(), updated_at timestamptz default now(), unique (bucket_id, name));
alter table storage.objects enable row level security;
create function storage.update_updated_at_column() returns trigger language plpgsql as $f$ begin new.updated_at = now(); return new; end $f$;
create trigger update_objects_updated_at before update on storage.objects for each row execute function storage.update_updated_at_column();
create schema cron;
create table cron.job (jobid bigserial primary key, schedule text, command text, nodename text default 'localhost', nodeport int default 5432, database text default 'postgres', username text default 'postgres', active boolean default true, jobname text);
create function cron.schedule(job_name text, schedule text, command text) returns bigint language sql as $f$ insert into cron.job (jobname, schedule, command) values (job_name, schedule, command) returning jobid $f$;
create function cron.alter_job(job_id bigint, active boolean default null) returns void language sql as $f$ update cron.job set active = coalesce($2, cron.job.active) where jobid = $1 $f$;
create schema vault;
create table vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, description text default '', secret text not null, created_at timestamptz default now(), updated_at timestamptz default now());
create function vault.create_secret(new_secret text, new_name text) returns uuid language sql as $f$ insert into vault.secrets (name, secret) values (new_name, new_secret) returning id $f$;
create function vault.update_secret(secret_id uuid, new_secret text) returns void language sql as $f$ update vault.secrets set secret = new_secret where id = secret_id $f$;
`;

/** A small Lovable Cloud app: people, a new-user trigger, rules, a view, an app schema, files, a job. */
export const APP = `
create extension citext with schema extensions;
create type public.role as enum ('admin', 'member');
create table public.profiles (id uuid primary key references auth.users(id) on delete cascade, display_name text, role public.role default 'member', avatar_url text);
create table public.posts (id bigserial primary key, author uuid references public.profiles(id), title text, created_at timestamptz default now());
create table public.settings (key text primary key, value extensions.citext);
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
create policy "own profile" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "read posts" on public.posts for select using (true);
create view public.post_titles as select id, title from public.posts;
create function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $f$
begin insert into public.profiles (id, display_name) values (new.id, new.email); return new; end $f$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
create function public.touch() returns trigger language plpgsql as $f$ begin new.created_at = now(); return new; end $f$;
create trigger posts_touch before insert on public.posts for each row execute function public.touch();
create function public.webhook() returns trigger language plpgsql as $f$ begin return new; end $f$;
create trigger posts_webhook after insert on public.posts for each row execute function public.webhook('https://${SRC}.supabase.co/functions/v1/send-digest');
create policy "avatar owner" on storage.objects for select to authenticated using (bucket_id = 'avatars' and owner_id = auth.uid()::text);
create function public.send_digest() returns text language plpgsql as $f$
begin return 'https://${SRC}.supabase.co/functions/v1/send-digest ' || '${jwt(SRC, "anon")}'; end $f$;
grant select on public.posts to anon;
grant all on public.posts, public.profiles to authenticated;
grant usage on sequence public.posts_id_seq to authenticated;
create schema billing;
create table billing.invoices (id serial primary key, profile uuid references public.profiles(id), amount int);
create schema supabase_migrations;
create table supabase_migrations.schema_migrations (version text primary key, statements text[], name text);
insert into supabase_migrations.schema_migrations (version, name) values ('20250101120003', 'init');

insert into auth.users (id, email, encrypted_password, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'ada@example.com', '$2a$10$abcdefghijklmnopqrstuv', '{"avatar_url": "https://${SRC}.supabase.co/storage/v1/object/public/avatars/ada.png"}'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com', '$2b$10$abcdefghijklmnopqrstuv', null),
  ('33333333-3333-3333-3333-333333333333', 'cy@example.com', null, null);
update public.profiles set avatar_url = 'https://${SRC}.supabase.co/storage/v1/object/sign/avatars/bob.png?token=abc' where id = '22222222-2222-2222-2222-222222222222';
insert into auth.identities (provider_id, user_id, provider) values
  ('ada', '11111111-1111-1111-1111-111111111111', 'email'),
  ('bob', '22222222-2222-2222-2222-222222222222', 'email'),
  ('g-cy', '33333333-3333-3333-3333-333333333333', 'google');
insert into auth.sessions (id, user_id) values ('44444444-4444-4444-4444-444444444444', '11111111-1111-1111-1111-111111111111');
insert into auth.refresh_tokens (token, user_id, session_id) values
  ('t1', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444'),
  ('t2', '11111111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444');
insert into public.posts (author, title) values
  ('11111111-1111-1111-1111-111111111111', 'Hello'),
  ('22222222-2222-2222-2222-222222222222', 'World'),
  ('11111111-1111-1111-1111-111111111111', 'Again');
insert into public.settings values ('theme', 'light'), ('lang', 'en');
insert into billing.invoices (profile, amount) values ('11111111-1111-1111-1111-111111111111', 100), ('22222222-2222-2222-2222-222222222222', 250);
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', false), ('public-images', 'public-images', true), ('database_export_10_10_26', 'database_export_10_10_26', false);
insert into storage.objects (bucket_id, name, owner_id, metadata) values
  ('avatars', '11111111-1111-1111-1111-111111111111/me.png', '11111111-1111-1111-1111-111111111111', '{"size": 1234, "mimetype": "image/png"}'),
  ('public-images', 'hero.jpg', null, '{"size": 99000, "mimetype": "image/jpeg"}'),
  ('database_export_10_10_26', 'app_261010.zip', null, '{"size": 5}');
insert into cron.job (schedule, command, jobname) values ('0 8 * * *', $c$select net.http_post('https://${SRC}.supabase.co/functions/v1/send-digest')$c$, 'daily-digest');
insert into vault.secrets (name, secret) values ('email_queue_service_role_key', 'encrypted'), ('stripe_webhook_key', 'encrypted');
`;

export interface LocalPostgres {
  dir: string;
  port: number;
  bin: string;
  psql(db: string, sql: string): string;
  url(db: string): string;
  target(db: string): {
    host: string;
    port: number;
    user: string;
    password: string;
    database: string;
    ssl: boolean;
  };
  /** Lovable's export of the source database: a zstd pg_dump archive, zipped. */
  exportZip(name?: string): Promise<string>;
  stop(): Promise<void>;
}

/** Start PostgreSQL with a source app (`src`) and a fresh Supabase project (`dst`). */
export async function startLocalPostgres(): Promise<LocalPostgres> {
  const bin = PG_BIN!;
  const dir = await mkdtemp(join(tmpdir(), "cloclod-pg-"));
  const port = await freePort();
  execFileSync(
    join(bin, "initdb"),
    ["-D", join(dir, "data"), "-U", "postgres", "--auth=trust", "-E", "UTF8", "--locale=C"],
    { stdio: "ignore" },
  );
  execFileSync(
    join(bin, "pg_ctl"),
    [
      "-D",
      join(dir, "data"),
      "-o",
      `-p ${port} -c listen_addresses=127.0.0.1 -k ${dir}`,
      "-l",
      join(dir, "server.log"),
      "-w",
      "start",
    ],
    { stdio: "ignore" },
  );
  const psql = (db: string, sql: string) =>
    execFileSync(
      join(bin, "psql"),
      [
        "-X",
        "-q",
        "-v",
        "ON_ERROR_STOP=1",
        "-h",
        "127.0.0.1",
        "-p",
        String(port),
        "-U",
        "postgres",
        "-d",
        db,
        "-f",
        "-",
      ],
      {
        input: sql,
        encoding: "utf8",
      },
    );
  psql("postgres", "create database src; create database dst;");
  psql("src", SUPABASE_BASE + APP);
  psql("dst", SUPABASE_BASE);
  return {
    dir,
    port,
    bin,
    psql,
    url: (db) => `postgresql://postgres@127.0.0.1:${port}/${db}`,
    target: (db) => ({
      host: "127.0.0.1",
      port,
      user: "postgres",
      password: "",
      database: db,
      ssl: false,
    }),
    exportZip: async (name = "export.zip") => {
      const backup = join(dir, "app_261010.backup");
      execFileSync(join(bin, "pg_dump"), [
        "-Fc",
        "--compress=zstd",
        "-h",
        "127.0.0.1",
        "-p",
        String(port),
        "-U",
        "postgres",
        "-d",
        "src",
        "-f",
        backup,
      ]);
      const zip = join(dir, name);
      await writeFile(
        zip,
        makeZip([{ name: "app_261010.backup", data: await readFile(backup), deflate: true }]),
      );
      return zip;
    },
    stop: async () => {
      spawnSync(join(bin, "pg_ctl"), ["-D", join(dir, "data"), "-m", "immediate", "stop"], {
        stdio: "ignore",
      });
      await rm(dir, { recursive: true, force: true });
    },
  };
}
