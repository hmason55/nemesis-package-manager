import SwaggerParser from "@apidevtools/swagger-parser";
import { fileURLToPath } from "node:url";
await SwaggerParser.validate(
  fileURLToPath(new URL("../../contracts/openapi.yaml", import.meta.url)),
  { resolve: { http: false } },
);
console.log("Registry OpenAPI contract validated.");
