"use strict";
// Serveur de notes pour le réseau local. Aucune dépendance : node server/server.js <dossier-notes>
const http = require("http");
const fs = require("fs/promises");
const path = require("path");

const appRoot = path.resolve(__dirname, "..");
const notesPath = process.argv[2] || process.env.NOTES_DIR;
if (!notesPath) {
    console.error("Dossier de notes obligatoire.\nUsage : node server/server.js <dossier-notes>");
    process.exit(1);
}
const notesRoot = path.resolve(notesPath);
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";
const token = process.env.NOTES_TOKEN || "";
const orderFile = ".notes-order.json";
const maxBodySize = 10 * 1024 * 1024;
const staticFiles = new Set(["index.html", "Bloc-notes_Markdown_icon.ico"]);
const staticDirs = ["css", "js"];
const mimeTypes = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".ico": "image/x-icon", ".json": "application/json; charset=utf-8"
};

class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}

// Hook d'authentification : à étendre (utilisateurs, sessions...) sans toucher aux routes.
function authorize(request) {
    if (!token) return true;
    return request.headers.authorization === `Bearer ${token}`;
}

function resolveInside(root, relativePath) {
    const segments = String(relativePath || "").split("/").filter(Boolean);
    if (segments.some(segment => segment.startsWith(".") || /[\\:\u0000]/.test(segment))) {
        throw new HttpError(400, "Chemin invalide.");
    }
    const resolved = path.resolve(root, ...segments);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new HttpError(400, "Chemin invalide.");
    return resolved;
}

async function readBody(request) {
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
        size += chunk.length;
        if (size > maxBodySize) throw new HttpError(413, "Contenu trop volumineux.");
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}

function send(response, status, body, headers = {}) {
    response.writeHead(status, { "Cache-Control": "no-store", ...headers });
    response.end(body);
}

const sendJson = (response, status, value) => send(response, status, JSON.stringify(value), { "Content-Type": "application/json; charset=utf-8" });

async function statOrNull(target) {
    try { return await fs.stat(target); }
    catch (error) { if (error.code === "ENOENT" || error.code === "ENOTDIR") return null; throw error; }
}

async function handleApi(request, response, url) {
    const route = url.pathname.slice("/api/".length);
    const relativePath = url.searchParams.get("path") || "";
    const target = resolveInside(notesRoot, relativePath);
    const method = request.method;

    if (route === "list" && method === "GET") {
        const info = await statOrNull(target);
        if (!info?.isDirectory()) throw new HttpError(404, "Dossier introuvable.");
        const result = [];
        for (const entry of await fs.readdir(target, { withFileTypes: true })) {
            if (entry.name.startsWith(".")) continue;
            if (entry.isDirectory()) result.push({ name: entry.name, kind: "directory" });
            else if (entry.isFile()) {
                const fileInfo = await fs.stat(path.join(target, entry.name));
                result.push({ name: entry.name, kind: "file", modified: fileInfo.mtimeMs, size: fileInfo.size });
            }
        }
        return sendJson(response, 200, result);
    }

    if (route === "stat" && method === "GET") {
        const info = await statOrNull(target);
        if (!info) throw new HttpError(404, "Introuvable.");
        return sendJson(response, 200, { kind: info.isDirectory() ? "directory" : "file", modified: info.mtimeMs, size: info.size });
    }

    if (route === "file" && method === "GET") {
        const info = await statOrNull(target);
        if (!info?.isFile()) throw new HttpError(404, "Fichier introuvable.");
        return send(response, 200, await fs.readFile(target), {
            "Content-Type": "text/plain; charset=utf-8",
            "X-Modified": String(info.mtimeMs),
            "Access-Control-Expose-Headers": "X-Modified"
        });
    }

    if (route === "file" && method === "PUT") {
        if (!relativePath) throw new HttpError(400, "Chemin invalide.");
        const parent = await statOrNull(path.dirname(target));
        if (!parent?.isDirectory()) throw new HttpError(404, "Dossier introuvable.");
        const existing = await statOrNull(target);
        if (existing && !existing.isFile()) throw new HttpError(409, "Un dossier porte déjà ce nom.");
        await fs.writeFile(target, await readBody(request));
        return send(response, 204);
    }

    if (route === "dir" && method === "POST") {
        if (!relativePath) throw new HttpError(400, "Chemin invalide.");
        const parent = await statOrNull(path.dirname(target));
        if (!parent?.isDirectory()) throw new HttpError(404, "Dossier parent introuvable.");
        if (!await statOrNull(target)) await fs.mkdir(target);
        return send(response, 204);
    }

    if (route === "entry" && method === "DELETE") {
        if (!relativePath) throw new HttpError(400, "Impossible de supprimer la racine.");
        const info = await statOrNull(target);
        if (!info) throw new HttpError(404, "Introuvable.");
        if (info.isDirectory()) await fs.rm(target, { recursive: url.searchParams.get("recursive") === "1" });
        else await fs.unlink(target);
        return send(response, 204);
    }

    if (route === "order" && method === "GET") {
        try { return sendJson(response, 200, JSON.parse(await fs.readFile(path.join(target, orderFile), "utf8"))); }
        catch { return sendJson(response, 200, []); }
    }

    if (route === "order" && method === "PUT") {
        const info = await statOrNull(target);
        if (!info?.isDirectory()) throw new HttpError(404, "Dossier introuvable.");
        let names;
        try { names = JSON.parse((await readBody(request)).toString("utf8")); }
        catch { throw new HttpError(400, "Ordre invalide."); }
        if (!Array.isArray(names) || names.some(name => typeof name !== "string")) throw new HttpError(400, "Ordre invalide.");
        await fs.writeFile(path.join(target, orderFile), JSON.stringify(names));
        return send(response, 204);
    }

    throw new HttpError(404, "Route inconnue.");
}

async function serveStatic(response, pathname) {
    let relative;
    try { relative = decodeURIComponent(pathname === "/" ? "/index.html" : pathname).slice(1); }
    catch { throw new HttpError(400, "Chemin invalide."); }
    if (!staticFiles.has(relative) && !staticDirs.includes(relative.split("/")[0])) throw new HttpError(404, "Introuvable.");
    const target = resolveInside(appRoot, relative);
    const info = await statOrNull(target);
    if (!info?.isFile()) throw new HttpError(404, "Introuvable.");
    send(response, 200, await fs.readFile(target), { "Content-Type": mimeTypes[path.extname(target)] || "application/octet-stream" });
}

const server = http.createServer(async (request, response) => {
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    try {
        if (request.method === "OPTIONS") return send(response, 204);
        const url = new URL(request.url, "http://localhost");
        if (url.pathname.startsWith("/api/")) {
            if (!authorize(request)) throw new HttpError(401, "Authentification requise.");
            return await handleApi(request, response, url);
        }
        if (request.method !== "GET") throw new HttpError(405, "Méthode non autorisée.");
        await serveStatic(response, url.pathname);
    } catch (error) {
        const status = error instanceof HttpError ? error.status : 500;
        if (status === 500) console.error(error);
        if (!response.headersSent) sendJson(response, status, { error: status === 500 ? "Erreur interne." : error.message });
        else response.end();
    }
});

statOrNull(notesRoot).then(info => {
    if (!info?.isDirectory()) {
        console.error(`Le dossier de notes n’existe pas : ${notesRoot}`);
        process.exit(1);
    }
    server.listen(port, host, () => {
        console.log(`Bloc-notes Markdown : http://localhost:${port}  (notes : ${notesRoot})`);
        if (!token) console.log("Aucun jeton défini (NOTES_TOKEN) : accès libre sur le réseau local.");
    });
});
