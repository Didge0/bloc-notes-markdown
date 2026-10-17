"use strict";
// Serveur de notes pour le réseau local. Aucune dépendance : node server/server.js <dossier-notes>
const http = require("http");
const fs = require("fs/promises");
const path = require("path");
const crypto = require("crypto");
const fsSync = require("fs");
const os = require("os");

const appRoot = path.resolve(__dirname, "..");
const notesPath = process.argv[2] || process.env.NOTES_DIR;
if (!notesPath) {
    console.error("Dossier de notes obligatoire.\nUsage : node server/server.js <dossier-notes>");
    process.exit(1);
}
const notesRoot = path.resolve(notesPath);
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || "0.0.0.0";
const minTokenLength = 32;
const isLoopback = ["127.0.0.1", "::1", "localhost"].includes(host);

function fail(message) {
    console.error(message);
    process.exit(1);
}

// NOTES_TOKEN_FILE est prioritaire : le jeton n'apparaît ni dans l'historique du terminal ni dans l'environnement.
function loadToken() {
    const file = process.env.NOTES_TOKEN_FILE;
    if (!file) return (process.env.NOTES_TOKEN || "").trim();
    let content;
    try { content = fsSync.readFileSync(file, "utf8").trim(); }
    catch { fail(`Impossible de lire le fichier de jeton : ${file}`); }
    if (!content) fail(`Le fichier de jeton est vide : ${file}`);
    return content;
}

let token = loadToken();
const tokenGenerated = !token;
if (tokenGenerated) token = crypto.randomBytes(32).toString("hex");
if (!isLoopback && token.length < minTokenLength) {
    fail(`Jeton trop court (${token.length} caractères) : ${minTokenLength} minimum quand le serveur écoute sur le réseau.\nGénérez-en un : node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`);
}
const digest = value => crypto.createHash("sha256").update(value).digest();
const expectedAuthorization = digest("Bearer " + token);
const orderFile = ".notes-order.json";
const maxBodySize = 10 * 1024 * 1024;
const maxAuthFailures = 5;
const authWindowMs = 15 * 60 * 1000;
const authLockoutMs = 15 * 60 * 1000;
const maxAuthClients = 10000;
const authFailures = new Map();
const logDir = path.resolve(process.env.LOG_DIR || path.join(os.homedir(), ".bloc-notes-markdown", "logs"));
const logFile = path.join(logDir, "server.jsonl");
function positiveIntegerOption(name, fallback, minimum, maximum) {
    if (!process.env[name]) return fallback;
    const value = Number(process.env[name]);
    if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
        fail(`${name} doit être un entier entre ${minimum} et ${maximum}.`);
    }
    return value;
}
const maxLogFileBytes = positiveIntegerOption("LOG_MAX_BYTES", 10 * 1024 * 1024, 1024, 1024 * 1024 * 1024);
const logBackupCount = positiveIntegerOption("LOG_BACKUPS", 5, 1, 20);
let logQueue = Promise.resolve();
const staticFiles = new Set(["index.html", "Bloc-notes_Markdown_icon.ico"]);
const staticDirs = ["css", "js"];
const mimeTypes = {
    ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
    ".ico": "image/x-icon", ".json": "application/json; charset=utf-8"
};

class HttpError extends Error {
    constructor(status, message) { super(message); this.status = status; }
}

async function rotateLogsIfNeeded(nextLineBytes) {
    let currentSize = 0;
    try { currentSize = (await fs.stat(logFile)).size; }
    catch (error) { if (error.code !== "ENOENT") throw error; }
    if (currentSize + nextLineBytes <= maxLogFileBytes) return;

    for (let index = logBackupCount; index >= 1; index--) {
        const source = index === 1 ? logFile : `${logFile}.${index - 1}`;
        const destination = `${logFile}.${index}`;
        if (index === logBackupCount) {
            try { await fs.unlink(destination); }
            catch (error) { if (error.code !== "ENOENT") throw error; }
        }
        try { await fs.rename(source, destination); }
        catch (error) { if (error.code !== "ENOENT") throw error; }
    }
}

function logEvent(fields) {
    const line = `${JSON.stringify({ timestamp: new Date().toISOString(), ...fields })}\n`;
    process.stdout.write(line);
    logQueue = logQueue.then(async () => {
        await fs.mkdir(logDir, { recursive: true });
        await rotateLogsIfNeeded(Buffer.byteLength(line));
        await fs.appendFile(logFile, line, { encoding: "utf8", mode: 0o600 });
    }).catch(error => {
        process.stderr.write(`${JSON.stringify({
            timestamp: new Date().toISOString(),
            level: "error",
            event: "logging.file_write_failed",
            message: error.message
        })}\n`);
    });
    return logQueue;
}

function requestAction(method, pathname) {
    if (!pathname.startsWith("/api/")) return method === "GET" ? "static.read" : "http.request";
    const route = pathname.slice("/api/".length);
    const actions = {
        "list:GET": "notes.list",
        "stat:GET": "entry.stat",
        "file:GET": "note.read",
        "file:PUT": "note.write",
        "dir:POST": "directory.create",
        "entry:DELETE": "entry.delete",
        "order:GET": "order.read",
        "order:PUT": "order.write"
    };
    return actions[`${route}:${method}`] || `api.${route || "unknown"}.${method.toLowerCase()}`;
}

// Hook d'authentification : à étendre (utilisateurs, sessions...) sans toucher aux routes.
function authorize(request) {
    const provided = digest(request.headers.authorization || "");
    return crypto.timingSafeEqual(provided, expectedAuthorization);
}

function clientAddress(request) {
    return (request.socket.remoteAddress || "unknown").replace(/^::ffff:/, "");
}

function authenticationBlock(request) {
    const now = Date.now();
    const address = clientAddress(request);
    const record = authFailures.get(address);
    if (record?.blockedUntil > now) return Math.ceil((record.blockedUntil - now) / 1000);
    if (record && (record.blockedUntil || now - record.windowStart >= authWindowMs)) authFailures.delete(address);
    return 0;
}

function recordAuthenticationFailure(request) {
    const now = Date.now();
    const address = clientAddress(request);
    let record = authFailures.get(address);
    if (!record || now - record.windowStart >= authWindowMs) record = { failures: 0, windowStart: now };
    record.failures += 1;
    if (record.failures >= maxAuthFailures) record.blockedUntil = now + authLockoutMs;

    if (!authFailures.has(address) && authFailures.size >= maxAuthClients) {
        for (const [knownAddress, knownRecord] of authFailures) {
            if (knownRecord.blockedUntil <= now || now - knownRecord.windowStart >= authWindowMs) authFailures.delete(knownAddress);
        }
        if (authFailures.size >= maxAuthClients) authFailures.delete(authFailures.keys().next().value);
    }
    authFailures.set(address, record);
    return record.blockedUntil ? Math.ceil((record.blockedUntil - now) / 1000) : 0;
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

const sendJson = (response, status, value, headers = {}) => send(response, status, JSON.stringify(value), { "Content-Type": "application/json; charset=utf-8", ...headers });

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
            "Access-Control-Expose-Headers": "X-Modified, X-Request-Id"
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
    const startedAt = process.hrtime.bigint();
    const requestId = crypto.randomUUID();
    let url;
    let action = "http.request";
    let resourcePath = "";
    let authentication = "not_required";
    let requestError = null;
    response.setHeader("X-Request-Id", requestId);
    response.setHeader("Access-Control-Expose-Headers", "X-Request-Id");
    response.setHeader("Access-Control-Allow-Origin", "*");
    response.setHeader("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    try {
        url = new URL(request.url, "http://localhost");
        action = request.method === "OPTIONS" ? "cors.preflight" : requestAction(request.method, url.pathname);
        resourcePath = url.pathname.startsWith("/api/") ? (url.searchParams.get("path") || "") : url.pathname;
        if (request.method === "OPTIONS") return send(response, 204);
        if (url.pathname.startsWith("/api/")) {
            const retryAfter = authenticationBlock(request);
            if (retryAfter) {
                authentication = "blocked";
                return sendJson(response, 429, { error: "Trop de tentatives. Réessayez plus tard." }, { "Retry-After": String(retryAfter) });
            }
            if (!authorize(request)) {
                authentication = "failed";
                const lockout = recordAuthenticationFailure(request);
                if (lockout) return sendJson(response, 429, { error: "Trop de tentatives. Réessayez plus tard." }, { "Retry-After": String(lockout) });
                throw new HttpError(401, "Authentification requise.");
            }
            authentication = "success";
            authFailures.delete(clientAddress(request));
            return await handleApi(request, response, url);
        }
        if (request.method !== "GET") throw new HttpError(405, "Méthode non autorisée.");
        await serveStatic(response, url.pathname);
    } catch (error) {
        requestError = error;
        const status = error instanceof HttpError ? error.status : 500;
        if (!response.headersSent) sendJson(response, status, { error: status === 500 ? "Erreur interne." : error.message });
        else response.end();
    } finally {
        const status = response.statusCode;
        const level = status >= 500 ? "error" : status >= 400 ? "warn" : "info";
        const elapsedMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        const errorDetails = status >= 500 && requestError ? {
            error_name: requestError.name,
            error_message: requestError.message,
            error_stack: requestError.stack
        } : requestError ? { error_name: requestError.name } : {};
        await logEvent({
            level,
            event: "http.request.completed",
            request_id: requestId,
            client_ip: clientAddress(request),
            user_agent: (request.headers["user-agent"] || "").slice(0, 300),
            method: request.method,
            action,
            resource_path: resourcePath,
            authentication,
            status,
            outcome: status < 400 ? "success" : status === 401 || status === 429 ? "denied" : "error",
            duration_ms: Math.round(elapsedMs * 100) / 100,
            ...errorDetails
        });
    }
});

let isShuttingDown = false;
function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;
    void logEvent({ level: "info", event: "server.stopping", signal }).then(() => {
        if (server.listening) server.close();
        else process.exit(0);
    });
}
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));

statOrNull(notesRoot).then(info => {
    if (!info?.isDirectory()) {
        console.error(`Le dossier de notes n’existe pas : ${notesRoot}`);
        process.exit(1);
    }
    server.listen(port, host, async () => {
        if (tokenGenerated) process.stderr.write(`Jeton généré pour cette session (à saisir dans le navigateur) : ${token}\n`);
        await logEvent({
            level: "info",
            event: "server.started",
            local_url: `http://localhost:${port}`,
            listen_host: host,
            listen_port: port,
            notes_root: notesRoot,
            log_file: logFile,
            log_max_file_bytes: maxLogFileBytes,
            log_backup_count: logBackupCount
        });
    });
});
