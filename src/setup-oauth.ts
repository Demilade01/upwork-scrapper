/**
 * One-time Upwork OAuth 2.0 setup script.
 *
 * Steps:
 *  1. Register your app at https://developers.upwork.com
 *     - Set Redirect URI to: http://localhost:3000/callback
 *  2. Add UPWORK_CLIENT_ID and UPWORK_CLIENT_SECRET to your .env
 *  3. Run: npm run setup-oauth
 *  4. Open the printed URL in your browser and authorise
 *  5. Copy the printed UPWORK_REFRESH_TOKEN into your .env
 */
import http from "http";
import dotenv from "dotenv";
import { resolve } from "path";

dotenv.config({ path: resolve(process.cwd(), ".env") });

const CLIENT_ID = process.env.UPWORK_CLIENT_ID;
const CLIENT_SECRET = process.env.UPWORK_CLIENT_SECRET;
const REDIRECT_URI = "http://localhost:3000/callback";
const PORT = 3000;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error(
    "❌ UPWORK_CLIENT_ID and UPWORK_CLIENT_SECRET must be in your .env file first."
  );
  process.exit(1);
}

const authUrl =
  `https://www.upwork.com/ab/account-security/oauth2/authorize` +
  `?response_type=code` +
  `&client_id=${encodeURIComponent(CLIENT_ID)}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

console.log("\n🔑 Upwork OAuth 2.0 One-Time Setup\n");
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("Make sure your Upwork app has this Redirect URI registered:");
console.log(`  ${REDIRECT_URI}`);
console.log("\nOpen this URL in your browser to authorise:\n");
console.log(`  ${authUrl}\n`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("Waiting for authorisation…\n");

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const code = url.searchParams.get("code");

  if (url.pathname !== "/callback" || !code) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end("No authorisation code found.");
    return;
  }

  res.writeHead(200, { "Content-Type": "text/html" });
  res.end(
    "<h2 style='font-family:sans-serif'>✅ Authorisation successful — check your terminal.</h2>"
  );
  server.close();

  console.log("✅ Code received. Exchanging for tokens…\n");

  const credentials = Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString(
    "base64"
  );

  const tokenRes = await fetch("https://www.upwork.com/api/v3/oauth2/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT_URI,
    }).toString(),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.error(`❌ Token exchange failed (${tokenRes.status}): ${body}`);
    process.exit(1);
  }

  const tokens = (await tokenRes.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("✅ Success! Add this line to your .env file:\n");
  console.log(`UPWORK_REFRESH_TOKEN=${tokens.refresh_token}`);
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");
  process.exit(0);
});

server.listen(PORT);
