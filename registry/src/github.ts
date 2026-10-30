import { Env, requireValue, now } from "./types";
import { b64 } from "./security";
export async function github(
  path: string,
  token: string,
  init: RequestInit = {},
): Promise<any> {
  const response = await fetch("https://api.github.com" + path, {
    ...init,
    headers: {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "NEMESIS-Registry",
      "Content-Type": "application/json",
    },
  });
  requireValue(
    response.ok,
    response.status === 403
      ? "GitHub permission denied or rate limited"
      : "GitHub request failed (" + response.status + ")",
    response.status === 404 ? 403 : 502,
  );
  return response.status === 204 ? {} : response.json();
}
export async function appToken(env: Env) {
  const enc = (x: unknown) => b64(new TextEncoder().encode(JSON.stringify(x)));
  const content =
    enc({ alg: "RS256", typ: "JWT" }) +
    "." +
    enc({ iat: now() - 60, exp: now() + 540, iss: env.GITHUB_APP_ID });
  const pem = env.GITHUB_PRIVATE_KEY.replace(/-----[^-]+-----/g, "").replace(
    /\s/g,
    "",
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    Uint8Array.from(atob(pem), (x) => x.charCodeAt(0)),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return (
    content +
    "." +
    b64(
      new Uint8Array(
        await crypto.subtle.sign(
          "RSASSA-PKCS1-v1_5",
          key,
          new TextEncoder().encode(content),
        ),
      ),
    )
  );
}
export async function installationToken(env: Env, installation: number) {
  return (
    await github(
      "/app/installations/" + installation + "/access_tokens",
      await appToken(env),
      {
        method: "POST",
        body: JSON.stringify({ permissions: { contents: "read" } }),
      },
    )
  ).token as string;
}
export async function checkRepository(
  env: Env,
  userToken: string,
  login: string,
  fullName: string,
) {
  requireValue(
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(fullName),
    "Invalid repository",
  );
  const repo = await github("/repos/" + fullName, userToken);
  requireValue(
    repo.private === false && !repo.archived && !repo.disabled,
    "Use an active public repository",
  );
  const permission = await github(
    "/repos/" +
      fullName +
      "/collaborators/" +
      encodeURIComponent(login) +
      "/permission",
    userToken,
  );
  requireValue(
    ["write", "maintain", "admin"].includes(permission.permission) ||
      permission.user?.permissions?.push,
    "Repository publishing permission required",
    403,
  );
  const installation = await github(
    "/repos/" + fullName + "/installation",
    await appToken(env),
  );
  return { repo, installation };
}
export async function dispatchValidation(env: Env, id: string) {
  requireValue(
    env.GITHUB_DISPATCH_TOKEN,
    "Validation dispatch is not configured",
    503,
  );
  requireValue(
    ["staging", "production"].includes(env.VALIDATION_ENVIRONMENT),
    "Validation environment is not configured",
    503,
  );
  await github(
    "/repos/" +
      env.VALIDATOR_REPOSITORY +
      "/actions/workflows/registry-validation.yml/dispatches",
    env.GITHUB_DISPATCH_TOKEN,
    {
      method: "POST",
      body: JSON.stringify({
        ref: "main",
        inputs: { submission_id: id, environment: env.VALIDATION_ENVIRONMENT },
      }),
    },
  );
}
