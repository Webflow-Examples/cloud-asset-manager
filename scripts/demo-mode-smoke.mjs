const baseUrl = (process.env.DEMO_CHECK_BASE_URL || "http://localhost:8787/assets").replace(/\/$/, "");

let cookie = "";

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(init.headers || {}),
    },
  });
  const setCookie = response.headers.get("set-cookie");
  if (setCookie) {
    cookie = setCookie.split(";")[0];
  }
  return response;
}

async function json(response) {
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function uploadFile(filename, type, contents) {
  const form = new FormData();
  const file = new File([contents], filename, { type });
  form.append("name", filename.replace(/\.[^.]+$/, ""));
  form.append("file", file);
  const response = await request("/api/assets", {
    method: "POST",
    body: form,
  });
  return response;
}

const configResponse = await request("/api/assets/config");
assert(configResponse.ok, `Config request failed with ${configResponse.status}`);
const config = await json(configResponse);
assert(config.demo?.enabled === true, "Expected demo mode to be enabled.");
assert(cookie, "Expected config request to set a demo session cookie.");

const blockedResponse = await uploadFile("blocked-demo.html", "text/html", "<h1>Blocked</h1>");
assert(blockedResponse.status === 400, `Expected blocked HTML upload, got ${blockedResponse.status}`);
const blocked = await json(blockedResponse);
assert(
  String(blocked?.error || "").includes("public demo"),
  "Expected blocked upload error to explain the public demo limit.",
);

const uploadResponse = await uploadFile("demo-note.txt", "text/plain", "Session-only demo upload");
assert(uploadResponse.status === 201, `Expected allowed text upload, got ${uploadResponse.status}`);
const uploaded = await json(uploadResponse);
const url = uploaded?.asset?.url;
assert(typeof url === "string" && url.includes("demo=1"), "Expected session upload URL with demo marker.");

const sessionFileResponse = await request(url.replace(baseUrl, ""));
assert(sessionFileResponse.ok, `Expected session file to load, got ${sessionFileResponse.status}`);

const anonymousFileResponse = await fetch(url);
assert(
  anonymousFileResponse.status === 404,
  `Expected anonymous session upload fetch to return 404, got ${anonymousFileResponse.status}`,
);

console.log("Demo mode smoke checks passed.");
