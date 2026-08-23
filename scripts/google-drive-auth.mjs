import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

try {
  const localVars = readFileSync(new URL("../.dev.vars", import.meta.url), "utf8");
  for (const line of localVars.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || match[2].startsWith("#") || process.env[match[1]]) continue;
    const rawValue = match[2];
    const value =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;
    process.env[match[1]] = value;
  }
} catch {
  // The guide asks the user to create .dev.vars before running this helper.
}

const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
const host = "127.0.0.1";
const port = 53682;
const redirectUri = `http://${host}:${port}/oauth2callback`;
const scope = "https://www.googleapis.com/auth/drive.file";

if (!clientId || !clientSecret) {
  console.error(
    "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET before running this command. See GOOGLE_DRIVE_SETUP.md.",
  );
  process.exit(1);
}

const state = randomBytes(24).toString("hex");
const authorizationUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authorizationUrl.search = new URLSearchParams({
  client_id: clientId,
  redirect_uri: redirectUri,
  response_type: "code",
  scope,
  access_type: "offline",
  prompt: "consent",
  include_granted_scopes: "true",
  state,
}).toString();

function html(title, message) {
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{margin:0;background:#f4f7fb;color:#10203a;font:16px/1.55 system-ui,sans-serif;display:grid;min-height:100vh;place-items:center}.card{max-width:560px;margin:24px;padding:32px;border:1px solid #dce3ec;border-radius:20px;background:#fff;box-shadow:0 20px 55px #182b4d18}h1{font-size:24px;margin:0 0 12px}p{margin:0;color:#526078}</style><body><main class="card"><h1>${title}</h1><p>${message}</p></main></body></html>`;
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url || "/", redirectUri);
  if (url.pathname !== "/oauth2callback") {
    response.writeHead(404).end("Not found");
    return;
  }

  const returnedState = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");

  if (oauthError || !code || returnedState !== state) {
    const reason = oauthError || "The OAuth callback was missing or invalid.";
    response.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html("Authorization failed", "Return to the terminal and run the command again."));
    console.error(`\nGoogle authorization failed: ${reason}`);
    server.close();
    process.exitCode = 1;
    return;
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });
    const token = await tokenResponse.json();

    if (!tokenResponse.ok || !token.refresh_token) {
      throw new Error(
        token.error_description ||
          token.error ||
          "Google did not return a refresh token. Remove the app from your Google Account connections and try again.",
      );
    }

    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    response.end(
      html(
        "Google Drive connected",
        "The refresh token is shown only in your terminal. Copy it into .dev.vars, then close this tab.",
      ),
    );
    console.log("\nAuthorization complete. Keep this value private:\n");
    console.log(`GOOGLE_REFRESH_TOKEN=${token.refresh_token}\n`);
    server.close();
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/html; charset=utf-8" });
    response.end(html("Token exchange failed", "Return to the terminal for details."));
    console.error(`\n${error instanceof Error ? error.message : "Token exchange failed."}`);
    server.close();
    process.exitCode = 1;
  }
});

server.listen(port, host, () => {
  console.log("\n1. Open this URL in your browser:\n");
  console.log(authorizationUrl.toString());
  console.log("\n2. Sign in to the Google account whose Drive will store the library.");
  console.log("3. Approve access and return here for the refresh token.\n");
});

const timeout = setTimeout(() => {
  console.error("\nAuthorization timed out. Run the command again.");
  server.close();
  process.exitCode = 1;
}, 10 * 60 * 1000);
timeout.unref();
