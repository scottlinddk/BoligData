import { createServer } from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";

const mime = {".html":"text/html; charset=utf-8",".js":"text/javascript; charset=utf-8",".css":"text/css; charset=utf-8",".json":"application/json",".webmanifest":"application/manifest+json",".svg":"image/svg+xml",".png":"image/png",".jpg":"image/jpeg",".jpeg":"image/jpeg",".ico":"image/x-icon",".woff2":"font/woff2"};
function queryParams(params) {
  const result = Object.create(null);
  for (const [key, value] of params) {
    const old = result[key];
    result[key] = old === undefined ? value : Array.isArray(old) ? [...old, value] : [old, value];
  }
  return result;
}
function decorateResponse(res) {
  res.status = code => { res.statusCode = code; return res; };
  res.json = body => { res.setHeader("Content-Type","application/json; charset=utf-8"); res.end(JSON.stringify(body)); return res; };
  res.send = body => { if (body !== null && typeof body === "object" && !Buffer.isBuffer(body)) return res.json(body); res.end(body); return res; };
  res.redirect = (code, url) => { if (typeof code === "string") { url = code; code = 307; } res.writeHead(code,{Location:url}); res.end(); return res; };
  return res;
}
async function body(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4 * 1024 * 1024) throw Object.assign(new Error("Request too large"), {status:413});
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return undefined;
  const type = (req.headers["content-type"] || "").split(";")[0];
  if (type === "application/json") {
    try { return JSON.parse(text); } catch { throw Object.assign(new Error("Invalid JSON"),{status:400}); }
  }
  if (type === "application/x-www-form-urlencoded") return queryParams(new URLSearchParams(text));
  return text;
}
export function createApplication({routes,dist}) {
  const root = resolve(dist);
  return createServer(async (req, rawRes) => {
    const res = decorateResponse(rawRes);
    res.setHeader("X-Content-Type-Options","nosniff");
    try {
      const url = new URL(req.url, "http://localhost");
      let pathname;
      try { pathname = decodeURIComponent(url.pathname); } catch { return res.status(400).json({error:"Invalid URL"}); }
      if (pathname === "/healthz") return res.status(200).json({status:"ok"});
      if (pathname === "/api" || pathname.startsWith("/api/")) {
        res.setHeader("Cache-Control","private, no-store");
        const route = routes.find(route => route.pattern.test(pathname));
        if (!route) return res.status(404).json({error:"Not found"});
        const match = route.pattern.exec(pathname);
        req.query = queryParams(url.searchParams);
        Object.assign(req.query,route.params?.(match) ?? {});
        req.cookies = Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map(cookie => {
          const index = cookie.indexOf("=");
          return index < 0 ? [cookie.trim(),""] : [cookie.slice(0,index).trim(),cookie.slice(index+1)];
        }));
        req.body = await body(req);
        await route.handler(req,res);
        return;
      }
      if (req.method !== "GET" && req.method !== "HEAD") return res.status(405).json({error:"Method not allowed"});
      if (pathname.includes("\0") || pathname.split("/").some(part => part.startsWith("."))) return res.status(404).end();
      let file = resolve(root,"."+pathname);
      if (file !== root && !file.startsWith(root+sep)) return res.status(404).end();
      let info = await stat(file).catch(() => null);
      if (!info?.isFile()) {
        if (extname(pathname)) return res.status(404).end();
        file = resolve(root,"index.html");
        info = await stat(file);
      }
      res.setHeader("Content-Type",mime[extname(file)] || "application/octet-stream");
      res.setHeader("Content-Length",info.size);
      res.setHeader("Cache-Control",pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache");
      if (req.method === "HEAD") return res.end();
      const stream = createReadStream(file);
      stream.on("error",() => res.destroy());
      stream.pipe(res);
    } catch (error) {
      if (res.headersSent) return res.destroy();
      const status = error?.status === 400 || error?.status === 413 ? error.status : 500;
      if (status === 500) console.error("Request failed",error?.name || "Error");
      res.status(status).json({error: status === 500 ? "Internal server error" : error.message});
    }
  });
}
