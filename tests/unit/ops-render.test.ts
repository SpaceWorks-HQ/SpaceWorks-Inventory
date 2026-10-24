import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";
import { envSchema, REQUIRED_IN_PRODUCTION } from "@/lib/env";

// Offline Blueprint checks, modeled on Bookings' ops-render.test.ts.
// Inventory deliberately prompts for external Supabase and Upstash URLs.
const root = join(import.meta.dirname, "../..");
const read = (file: string) => readFileSync(join(root, file), "utf8");

type EnvVar = {
  key?: string;
  value?: string | number | boolean;
  generateValue?: boolean;
  sync?: boolean;
  fromGroup?: string;
  fromDatabase?: { name: string; property: string };
  fromService?: { type: string; name: string; envVarKey?: string; property?: string };
};
type Service = {
  type: string;
  name: string;
  runtime?: string;
  plan?: string;
  region?: string;
  repo?: string;
  branch?: string;
  image?: { url: string };
  dockerfilePath?: string;
  dockerContext?: string;
  dockerCommand?: string;
  preDeployCommand?: string;
  healthCheckPath?: string;
  numInstances?: number;
  envVars?: EnvVar[];
};
type Blueprint = {
  services: Service[];
  databases?: { name: string }[];
  envVarGroups?: { name: string; envVars: EnvVar[] }[];
};

const blueprint = parse(read("render.yaml")) as Blueprint;
const web = blueprint.services.filter((service) => service.type === "web");
const workers = blueprint.services.filter((service) => service.type === "worker");
const appServices = [...web, ...workers];
const groups = new Map(blueprint.envVarGroups?.map((group) => [group.name, group.envVars]));
const allEntries = [
  ...blueprint.services.flatMap((service) => service.envVars ?? []),
  ...(blueprint.envVarGroups ?? []).flatMap((group) => group.envVars),
];

function envOf(service: Service): EnvVar[] {
  return (service.envVars ?? []).flatMap((env) => {
    if (!env.fromGroup) return [env];
    expect(groups.has(env.fromGroup), `Unknown group ${env.fromGroup}`).toBe(true);
    return groups.get(env.fromGroup)!;
  });
}

// Follow envVarKey references too: a key pointing at an unset key is not provided.
function resolveEnv(service: Service, key: string, visited: string[] = []): EnvVar {
  const id = `${service.name}:${key}`;
  expect(visited, `Circular reference at ${id}`).not.toContain(id);
  const env = envOf(service).find((entry) => entry.key === key);
  expect(env, `${id} is missing`).toBeDefined();
  if (env!.fromService?.envVarKey) {
    const source = blueprint.services.find((entry) => entry.name === env!.fromService!.name);
    expect(source, `Unknown service for ${id}`).toBeDefined();
    return resolveEnv(source!, env!.fromService.envVarKey, [...visited, id]);
  }
  return env!;
}

function requiredKeys() {
  const alwaysRequired = Object.entries(envSchema.shape)
    .filter(([, schema]) => !schema.safeParse(undefined).success)
    .map(([key]) => key);
  const required = [...new Set([...alwaysRequired, ...REQUIRED_IN_PRODUCTION])];
  const preflight = /const REQUIRED = \[([\s\S]*?)\];/.exec(read("scripts/check-production-env.mjs"));
  expect(preflight, "Production preflight must declare its required keys").not.toBeNull();
  const scriptKeys = [...preflight![1].matchAll(/"([A-Z0-9_]+)"/g)].map((match) => match[1]);
  expect(scriptKeys.sort()).toEqual([...required].sort());
  return required;
}

describe("render.yaml", () => {
  it("parses as YAML and gives every service a unique name and compute configuration", () => {
    expect(() => parse(read("render.yaml"))).not.toThrow();
    expect(blueprint.services.length).toBeGreaterThan(0);
    const names = [...blueprint.services, ...(blueprint.databases ?? [])].map((entry) => entry.name);
    expect(new Set(names).size).toBe(names.length);
    for (const service of blueprint.services) {
      expect(service.name).toMatch(/^[a-z][a-z0-9-]+$/);
      expect(["web", "pserv", "worker", "cron", "keyvalue", "redis"]).toContain(service.type);
      expect(service.plan).toEqual(expect.any(String));
      expect(service.plan).not.toBe("");
      if (!["keyvalue", "redis"].includes(service.type)) expect(service.runtime).toBe("docker");
      if (["web", "pserv"].includes(service.type)) expect(service.healthCheckPath).toMatch(/^\//);
    }
  });

  it("runs web, BullMQ worker and exactly one beat from the same backend build", () => {
    expect(web).toHaveLength(1);
    expect(web[0]).toMatchObject({
      name: "spaceworks-inventory", dockerCommand: "node server.js",
      preDeployCommand: "docker-entrypoint.sh migrate", healthCheckPath: "/api/health",
      dockerfilePath: "./Dockerfile", dockerContext: ".",
    });
    expect(workers.map((service) => [service.name, service.dockerCommand])).toEqual([
      ["spaceworks-inventory-worker", "node dist/worker.js"],
      ["spaceworks-inventory-beat", "node dist/beat.js"],
    ]);
    expect(workers[1].numInstances ?? 1).toBe(1);
    for (const service of appServices) {
      expect(service.plan).not.toBe("free");
      for (const field of ["runtime", "repo", "branch", "image", "dockerfilePath", "dockerContext", "region"] as const) {
        expect(service[field], `${service.name}: ${field}`).toEqual(web[0][field]);
      }
    }
  });

  it("provides every production-required variable and a usable source for every key", () => {
    for (const service of appServices) {
      const entries = envOf(service);
      const keys = entries.map((env) => env.key);
      expect(new Set(keys).size, `${service.name} has duplicate variables`).toBe(keys.length);
      for (const key of requiredKeys()) resolveEnv(service, key);
      if (keys.includes("SMTP_HOST") || keys.includes("SMTP_SERVICE")) {
        for (const key of ["EMAIL_FROM", "SMTP_USER", "SMTP_PASSWORD"]) resolveEnv(service, key);
      }
      expect(keys.includes("S3_ACCESS_KEY_ID")).toBe(keys.includes("S3_SECRET_ACCESS_KEY"));
      if (entries.find((env) => env.key === "DEPLOYMENT_MODE")?.value === "backend") {
        resolveEnv(service, "FRONTEND_GATEWAY_SECRET");
      }
    }
    for (const env of allEntries.filter((entry) => !entry.fromGroup)) {
      expect(env.key).toMatch(/^[A-Z][A-Z0-9_]*$/);
      const sources = [env.value !== undefined, env.generateValue === true,
        env.sync === false, !!env.fromDatabase, !!env.fromService];
      expect(sources.filter(Boolean), `${env.key} needs exactly one source`).toHaveLength(1);
      if (env.value !== undefined) expect(String(env.value).trim(), `${env.key} is empty`).not.toBe("");
    }
    // Render ignores prompts and resource references in environment groups.
    for (const env of (blueprint.envVarGroups ?? []).flatMap((group) => group.envVars)) {
      expect(env.sync === undefined && !env.fromService && !env.fromDatabase && !env.fromGroup, env.key).toBe(true);
    }
  });

  it("generates operational secrets once and never embeds literal credentials", () => {
    for (const key of ["AUTH_SECRET", "CRON_SECRET", "HEALTHCHECK_SECRET"]) {
      expect(resolveEnv(web[0], key)).toEqual({ key, generateValue: true });
    }
    const credentials = /(?:SECRET|PASSWORD|ENCRYPTION_KEY|ACCESS_KEY_ID)$|^(?:DATABASE_URL|DIRECT_URL|REDIS_URL)$/;
    for (const env of allEntries) {
      if (env.key && credentials.test(env.key)) expect(env.value, `${env.key} must not be literal`).toBeUndefined();
      if (env.generateValue !== undefined) expect(env).toEqual({ key: env.key, generateValue: true });
    }
    for (const worker of workers) {
      for (const env of envOf(web[0])) {
        if (env.key === "NODE_OPTIONS") continue; // Web-only memory tuning.
        expect(envOf(worker)).toContainEqual({
          key: env.key, fromService: { type: "web", name: web[0].name, envVarKey: env.key },
        });
        expect(resolveEnv(worker, env.key!)).toEqual(resolveEnv(web[0], env.key!));
      }
    }
  });

  it("resolves database and service references inside this Blueprint", () => {
    for (const env of allEntries) {
      if (env.fromDatabase) {
        expect(blueprint.databases?.some((db) => db.name === env.fromDatabase!.name), env.key).toBe(true);
        expect(env.fromDatabase.property).toBeTruthy();
      }
      if (env.fromService) {
        const reference = env.fromService;
        const source = blueprint.services.find((service) => service.name === reference.name);
        expect(source, `${env.key}: unknown service ${reference.name}`).toBeDefined();
        expect(source!.type).toBe(reference.type);
        expect(Boolean(reference.envVarKey) !== Boolean(reference.property), env.key).toBe(true);
        if (reference.envVarKey) resolveEnv(source!, reference.envVarKey);
        if (reference.property === "connectionString") expect(["keyvalue", "redis"]).toContain(source!.type);
      }
    }
    // These data services are external by design, rather than undeclared Render resources.
    for (const key of ["DATABASE_URL", "DIRECT_URL", "REDIS_URL"]) {
      for (const service of appServices) expect(resolveEnv(service, key)).toEqual({ key, sync: false });
    }
  });

  it("documents every environment key in .env.example and docs/CONFIGURATION.md", () => {
    const template = read(".env.example");
    const configuration = read("docs/CONFIGURATION.md");
    for (const key of new Set(allEntries.flatMap((env) => env.key ? [env.key] : []))) {
      expect(template, `${key} in .env.example`).toMatch(new RegExp(`^(?:#\\s*)?${key}=`, "m"));
      expect(configuration, `${key} in docs/CONFIGURATION.md`).toMatch(new RegExp(`\\b${key}\\b`));
    }
  });
});
