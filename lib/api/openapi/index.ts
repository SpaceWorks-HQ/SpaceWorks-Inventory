import { API_SCOPES } from "@/lib/apiTokens/scopes";
import { cataloguePaths } from "./catalogue";
import { parameters, responses, schemas } from "./components";
import { workflowPaths } from "./workflows";

/** The hand-written OpenAPI 3.1 document served at /api/v1/openapi.json. */
export function openApiDocument(baseUrl: string) {
  return {
    openapi: "3.1.0",
    info: {
      title: "Space Works Inventory API",
      version: "1.0.0",
      description: "Space-bound REST API. Send an API key created under Space settings → Integrations as `Authorization: Bearer swi_…`. A key acts for its creator within its scopes and stops working when the creator is no longer an inventory manager. Lists use cursor pagination (`limit` ≤ 100, `cursor` = `nextCursor`). Money is integer minor units of the space currency. Errors are `{ error: { code, message } }`.",
      license: { name: "AGPL-3.0-or-later", identifier: "AGPL-3.0-or-later" },
    },
    servers: [{ url: `${baseUrl.replace(/\/$/, "")}/api/v1` }],
    security: [{ apiKey: [] }],
    tags: [{ name: "Catalogue" }, { name: "Stock" }, { name: "Loans" }, { name: "Transfers" }, { name: "Members" }, { name: "Reports" }],
    paths: { ...cataloguePaths, ...workflowPaths },
    components: {
      securitySchemes: {
        apiKey: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "swi_<prefix>_<secret>",
          description: `Scopes: ${API_SCOPES.map((scope) => `${scope.value} (${scope.description})`).join("; ")}`,
        },
      },
      schemas,
      parameters,
      responses,
    },
  };
}
