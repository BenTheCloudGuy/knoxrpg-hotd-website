#!/usr/bin/env node
// Fetch Forgotten Realms: Heroes of Faerûn content from D&D Beyond
// Uses Cobalt session token → Bearer token exchange

const fs = require("fs");
const path = require("path");

const COBALT_TOKEN = process.env.DDB_COBALT_TOKEN;
if (!COBALT_TOKEN) { console.error("Set DDB_COBALT_TOKEN env var"); process.exit(1); }

async function getCobaltBearerToken() {
  const resp = await fetch("https://auth-service.dndbeyond.com/v1/cobalt-token", {
    method: "POST",
    headers: { Cookie: `CobaltSession=${COBALT_TOKEN}` },
  });
  if (!resp.ok) throw new Error(`Cobalt exchange failed (${resp.status}): ${await resp.text()}`);
  const body = await resp.json();
  if (!body.token) throw new Error("No bearer token returned");
  console.log(`Bearer token obtained (ttl: ${body.ttl}s)`);
  return body.token;
}

async function tryEndpoint(label, url, headers, saveFile) {
  try {
    const resp = await fetch(url, { headers, redirect: "manual" });
    const ct = resp.headers.get("content-type") || "";
    const location = resp.headers.get("location") || "";
    const body = ct.includes("json") ? await resp.json() : await resp.text();
    console.log(`\n=== ${label} ===`);
    console.log(`Status: ${resp.status} | Content-Type: ${ct}`);
    if (location) console.log(`Redirect: ${location}`);
    if (typeof body === "string") {
      console.log(`Length: ${body.length} chars`);
      console.log(`Body (first 800 chars): ${body.substring(0, 800)}`);
      if (saveFile && resp.status === 200 && body.length > 1000) {
        fs.writeFileSync(saveFile, body);
        console.log(`Saved to: ${saveFile}`);
      }
    } else {
      console.log(`Body keys: ${Object.keys(body).join(", ")}`);
      const json = JSON.stringify(body, null, 2);
      console.log(`Body (first 1500 chars): ${json.substring(0, 1500)}`);
      if (saveFile && resp.status === 200) {
        fs.writeFileSync(saveFile, json);
        console.log(`Saved to: ${saveFile}`);
      }
    }
    return { status: resp.status, body };
  } catch (err) {
    console.log(`\n=== ${label} ===`);
    console.log(`Error: ${err.message}`);
    return null;
  }
}

const OUT_DIR = path.join(__dirname, "..", "tmp", "frhof-raw");
fs.mkdirSync(OUT_DIR, { recursive: true });

(async () => {
  const bearer = await getCobaltBearerToken();
  const authHeaders = { Authorization: `Bearer ${bearer}` };
  const cookieHeaders = {
    Cookie: `CobaltSession=${COBALT_TOKEN}`,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "User-Agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  };

  // 1. Try cookie-based access to the chapter page (like a browser)
  await tryEndpoint(
    "Cookie-based chapter page",
    "https://www.dndbeyond.com/sources/dnd/frhof/a-guide-to-the-realms",
    cookieHeaders,
    path.join(OUT_DIR, "guide-to-realms-cookie.html")
  );

  // 2. Try the compendium content API with bearer
  await tryEndpoint(
    "Compendium content API (bearer)",
    "https://www.dndbeyond.com/api/compendium/sources/frhof/a-guide-to-the-realms",
    authHeaders,
    path.join(OUT_DIR, "guide-to-realms-api.json")
  );

  // 3. Try proxy/content endpoint
  await tryEndpoint(
    "Proxy content endpoint",
    "https://www.dndbeyond.com/proxy/compendium/sources/frhof/a-guide-to-the-realms",
    authHeaders,
    path.join(OUT_DIR, "guide-to-realms-proxy.json")
  );

  // 4. Try the content-service with bearer
  await tryEndpoint(
    "Content service v1",
    "https://content-service.dndbeyond.com/compendium/sources/dnd/frhof/a-guide-to-the-realms",
    authHeaders
  );

  // 5. Try the SPA JSON data endpoint (the React app loads content via XHR)
  await tryEndpoint(
    "SPA JSON endpoint (Accept: application/json)",
    "https://www.dndbeyond.com/sources/dnd/frhof/a-guide-to-the-realms",
    { ...cookieHeaders, Accept: "application/json" },
    path.join(OUT_DIR, "guide-to-realms-json.json")
  );

  // 6. Try mobile compendium API paths
  const mobileEndpoints = [
    "https://www.dndbeyond.com/mobile/compendium/sources/dnd/frhof/a-guide-to-the-realms",
    "https://www.dndbeyond.com/mobile/api/v6/compendium/sources/dnd/frhof",
    "https://www.dndbeyond.com/mobile/api/v6/compendium/rule/frhof/a-guide-to-the-realms",
    "https://www.dndbeyond.com/api/compendium/rule/frhof/a-guide-to-the-realms",
  ];
  for (const url of mobileEndpoints) {
    const label = url.replace("https://www.dndbeyond.com/", "");
    await tryEndpoint(label, url, authHeaders);
  }

  // 7. Try chapter-specific content chunk API (DDB uses data-content-chunk-id)
  await tryEndpoint(
    "Content chunks API",
    "https://www.dndbeyond.com/api/content/sources/frhof/chapters",
    authHeaders
  );

  console.log("\n=== Done ===");
})();
