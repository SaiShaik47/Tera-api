import express from "express";
import { chromium } from "playwright";
import { fetch } from "undici";

const app = express();
app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) => res.json({ ok: true }));
app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "TeraBox folder streaming API",
    endpoints: {
      health: "GET /health",
      folder: "POST /folder { url, cookie }",
      resolve: "POST /resolve { url, cookie, pick }",
      stream: "GET /stream?url=... (header: x-cookie)"
    }
  });
});

/**
 * POST /folder
 * body: { url: "<terabox folder link>", cookie: "<document.cookie>" }
 * returns: files[] = [{ name, size, id }]
 */
app.post("/folder", async (req, res) => {
  const { url, cookie } = req.body || {};
  if (!url) return res.status(400).json({ ok: false, error: "MISSING_URL" });
  if (!cookie) return res.status(400).json({ ok: false, error: "MISSING_COOKIE" });

  try {
    const files = await listFolderFiles(url, cookie);

    if (!files.length) {
      return res.json({
        ok: false,
        error: "NO_FILES_FOUND",
        message:
          "I opened the folder, but couldn’t read the file list. TeraBox layout/API may be different for your link."
      });
    }

    res.json({ ok: true, count: files.length, files });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      message: error?.message || "Error"
    });
  }
});

/**
 * POST /resolve
 * body: { url: "<terabox folder link>", cookie: "<document.cookie>", pick: 0 }
 * pick = which file number from /folder list (0 = first)
 *
 * returns: metadata attaching downloadUrl (stream link)
 */
app.post("/resolve", async (req, res) => {
  const { url, cookie, pick } = req.body || {};
  if (!url) return res.status(400).json({ ok: false, error: "MISSING_URL" });
  if (!cookie) return res.status(400).json({ ok: false, error: "MISSING_COOKIE" });

  const index = Number.isInteger(pick) ? pick : 0;

  try {
    const files = await listFolderFiles(url, cookie);
    if (!files.length) {
      return res.json({ ok: false, error: "NO_FILES_FOUND", message: "Folder list empty." });
    }
    if (index < 0 || index >= files.length) {
      return res.json({
        ok: false,
        error: "BAD_PICK",
        message: `pick must be between 0 and ${files.length - 1}`
      });
    }

    // IMPORTANT:
    // Many TeraBox flows don’t give a permanent direct URL. Sometimes we can only stream by using a download endpoint.
    // Here we do "best effort": if the network JSON contained something that looks like a direct URL, we use it.
    const directUrl = files[index].directUrl || null;

    if (!directUrl) {
      return res.json({
        ok: false,
        error: "NO_DIRECT_URL",
        message:
          "I found the file, but didn’t get a direct download URL from TeraBox yet. I can adapt the resolver if you share the exact share-link format (without cookies)."
      });
    }

    const meta = await getMetadata(directUrl, cookie);
    const streamUrl = `${req.protocol}://${req.get("host")}/stream?url=${encodeURIComponent(
      directUrl
    )}`;

    return res.json({
      ok: true,
      name: meta.name,
      size: meta.size,
      mime: meta.mime,
      downloadUrl: streamUrl
    });
  } catch (error) {
    res.status(500).json({
      ok: false,
      error: "SERVER_ERROR",
      message: error?.message || "Error"
    });
  }
});

/**
 * GET /stream?url=<directUrl>
 * header: x-cookie: <cookie>
 */
app.get("/stream", async (req, res) => {
  const directUrl = req.query.url?.toString();
  const cookie = req.headers["x-cookie"]?.toString();

  if (!directUrl) return res.status(400).json({ ok: false, error: "MISSING_URL" });
  if (!cookie) return res.status(400).json({ ok: false, error: "MISSING_COOKIE_HEADER" });

  const upstream = await fetch(directUrl, {
    method: "GET",
    headers: { cookie },
    redirect: "follow"
  });

  if (!upstream.ok) {
    return res.status(upstream.status).json({
      ok: false,
      error: "UPSTREAM_ERROR",
      message: `Upstream returned ${upstream.status}`
    });
  }

  const ct = upstream.headers.get("content-type") || "application/octet-stream";
  const cl = upstream.headers.get("content-length");
  const cd = upstream.headers.get("content-disposition");

  res.setHeader("Content-Type", ct);
  if (cl) res.setHeader("Content-Length", cl);
  if (cd) res.setHeader("Content-Disposition", cd);

  upstream.body.pipe(res);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Running on", PORT));

/* ---------------- helpers ---------------- */

function guessDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "www.1024tera.com";
  }
}

function cookieStringToPlaywrightCookies(cookieStr, domain) {
  return cookieStr
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf("=");
      const name = i > -1 ? pair.slice(0, i).trim() : pair.trim();
      const value = i > -1 ? pair.slice(i + 1).trim() : "";
      return { name, value, domain, path: "/" };
    });
}

async function listFolderFiles(folderUrl, cookieStr) {
  const domain = guessDomain(folderUrl);
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"]
  });
  const context = await browser.newContext();

  // Add cookies
  await context.addCookies([
    ...cookieStringToPlaywrightCookies(cookieStr, domain),
    ...cookieStringToPlaywrightCookies(cookieStr, "." + domain)
  ]);

  const page = await context.newPage();

  const foundFiles = [];
  const seen = new Set();

  // We try to read JSON responses and look for "list" arrays with file-like objects.
  page.on("response", async (resp) => {
    try {
      const ct = resp.headers()["content-type"] || "";
      if (!ct.includes("application/json")) return;

      const data = await resp.json();

      // Try common shapes
      const candidates =
        (Array.isArray(data?.list) && data.list) ||
        (Array.isArray(data?.data?.list) && data.data.list) ||
        (Array.isArray(data?.data) && data.data) ||
        null;

      if (!candidates) return;

      for (const item of candidates) {
        const name = item?.server_filename || item?.name || item?.filename;
        const size = item?.size ?? item?.filesize ?? null;

        // Sometimes direct link exists in JSON (not always)
        const directUrl = item?.dlink || item?.downloadUrl || item?.directUrl || null;

        // any unique id
        const id = item?.fs_id || item?.id || item?.file_id || name;

        if (!name) continue;
        const key = `${id}:${name}`;
        if (seen.has(key)) continue;
        seen.add(key);

        foundFiles.push({ id, name, size, directUrl });
      }
    } catch {
      // ignore
    }
  });

  await page.goto(folderUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(6_000); // let folder API calls load

  await browser.close();
  return foundFiles.slice(0, 200);
}

async function getMetadata(url, cookie) {
  let r = await fetch(url, { method: "HEAD", headers: { cookie }, redirect: "follow" });
  if (r.status === 405 || r.status === 403) {
    r = await fetch(url, {
      method: "GET",
      headers: { cookie, Range: "bytes=0-0" },
      redirect: "follow"
    });
  }
  const mime = r.headers.get("content-type");
  const sizeHeader = r.headers.get("content-length");
  const cd = r.headers.get("content-disposition");

  return {
    mime: mime || null,
    size: sizeHeader ? Number(sizeHeader) : null,
    name: filenameFromDisposition(cd) || nameFromUrl(url)
  };
}

function filenameFromDisposition(cd) {
  if (!cd) return null;
  const m = /filename\*?=(?:UTF-8'')?("?)([^";]+)\1/i.exec(cd);
  if (!m) return null;
  try {
    return decodeURIComponent(m[2]);
  } catch {
    return m[2];
  }
}

function nameFromUrl(url) {
  try {
    const u = new URL(url);
    const base = u.pathname.split("/").pop() || "download";
    return decodeURIComponent(base);
  } catch {
    return "download";
  }
}
