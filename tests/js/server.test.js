"use strict";
// Lancer avec : node --test tests/js/server.test.js
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { once } = require("node:events");

const port = 3900 + Math.floor(Math.random() * 90);
const base = `http://127.0.0.1:${port}`;
const token = "test-token";
let child;
let notesDir;
const auth = { Authorization: `Bearer ${token}` };
const api = (route, query, options = {}) => fetch(`${base}/api/${route}?${new URLSearchParams(query)}`, { ...options, headers: { ...auth, ...options.headers } });

before(async () => {
    notesDir = fs.mkdtempSync(path.join(os.tmpdir(), "notes-test-"));
    child = spawn(process.execPath, [path.join(__dirname, "..", "..", "server", "server.js"), notesDir], {
        env: {
            ...process.env, PORT: String(port), HOST: "127.0.0.1", NOTES_TOKEN: token, NOTES_TOKEN_FILE: "",
            LOG_DIR: path.join(notesDir, ".server-logs")
        }, stdio: "ignore"
    });
    for (let attempt = 0; attempt < 50; attempt++) {
        try { await fetch(`${base}/`); return; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    throw new Error("Le serveur n’a pas démarré.");
});

after(async () => {
    await stopServer(child);
    fs.rmSync(notesDir, { recursive: true, force: true });
});

test("exige le jeton sur l’API mais pas sur les fichiers statiques", async () => {
    assert.equal((await fetch(`${base}/api/list?path=`)).status, 401);
    assert.equal((await fetch(`${base}/api/list?path=`, { headers: { Authorization: "Bearer faux" } })).status, 401);
    assert.equal((await fetch(`${base}/`)).status, 200);
});

test("écrit, lit, liste et supprime une note", async () => {
    assert.equal((await api("file", { path: "a.md" }, { method: "PUT", body: "# Salut é" })).status, 204);
    const read = await api("file", { path: "a.md" });
    assert.equal(await read.text(), "# Salut é");
    assert.ok(Number(read.headers.get("x-modified")) > 0);
    const list = await (await api("list", { path: "" })).json();
    assert.deepEqual(list.map(entry => [entry.name, entry.kind]), [["a.md", "file"]]);
    assert.equal((await api("entry", { path: "a.md" }, { method: "DELETE" })).status, 204);
    assert.equal((await api("file", { path: "a.md" })).status, 404);
});

test("crée et supprime récursivement un dossier", async () => {
    assert.equal((await api("dir", { path: "d" }, { method: "POST" })).status, 204);
    await api("file", { path: "d/x.md" }, { method: "PUT", body: "x" });
    assert.equal((await api("entry", { path: "d" }, { method: "DELETE" })).status, 500, "dossier non vide sans recursive");
    assert.equal((await api("entry", { path: "d", recursive: "1" }, { method: "DELETE" })).status, 204);
    assert.equal((await api("stat", { path: "d" })).status, 404);
});

test("enregistre et relit l’ordre des notes, hors de la liste", async () => {
    assert.equal((await api("order", { path: "" }, { method: "PUT", body: JSON.stringify(["b.md", "a.md"]) })).status, 204);
    assert.deepEqual(await (await api("order", { path: "" })).json(), ["b.md", "a.md"]);
    assert.equal((await api("order", { path: "" }, { method: "PUT", body: "{}" })).status, 400);
    const names = (await (await api("list", { path: "" })).json()).map(entry => entry.name);
    assert.ok(!names.some(name => name.startsWith(".")));
});

test("refuse les chemins hors du dossier de notes", async () => {
    for (const bad of ["../x.md", "a/../../x.md", "..", ".secret", "a\\b.md", "C:/x.md"]) {
        assert.equal((await api("file", { path: bad }, { method: "PUT", body: "x" })).status, 400, bad);
    }
    assert.equal((await api("entry", { path: "" }, { method: "DELETE" })).status, 400);
});

test("ne sert que l’application en statique", async () => {
    for (const bad of ["/server/server.js", "/tests/js/notes.test.js", "/README.md", "/.git/config", "/js/../server/server.js", "/%2e%2e/server/server.js"]) {
        const response = await fetch(`${base}${bad}`);
        assert.ok([400, 404].includes(response.status), `${bad} → ${response.status}`);
    }
    assert.equal((await fetch(`${base}/js/app.js`)).status, 200);
});

test("répond aux pré-requêtes CORS", async () => {
    const response = await fetch(`${base}/api/list`, { method: "OPTIONS" });
    assert.equal(response.status, 204);
    assert.equal(response.headers.get("access-control-allow-origin"), "*");
});

test("refuse de démarrer sans dossier de notes valide", () => {
    const { spawnSync } = require("node:child_process");
    const script = path.join(__dirname, "..", "..", "server", "server.js");
    const env = { ...process.env, NOTES_DIR: "" };
    const withoutPath = spawnSync(process.execPath, [script], { env, encoding: "utf8", timeout: 5000 });
    assert.equal(withoutPath.status, 1);
    assert.match(withoutPath.stderr, /obligatoire/);
    const missing = spawnSync(process.execPath, [script, path.join(notesDir, "inexistant")], { env, encoding: "utf8", timeout: 5000 });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /n’existe pas/);
});

const script = path.join(__dirname, "..", "..", "server", "server.js");
const longToken = "a".repeat(40);

async function stopServer(childProcess) {
    if (!childProcess || childProcess.exitCode !== null || childProcess.signalCode !== null) return;
    const exited = once(childProcess, "exit");
    childProcess.kill();
    await exited;
}

function startServer(env) {
    const extraPort = 4000 + Math.floor(Math.random() * 900);
    const process_ = spawn(process.execPath, [script, notesDir], {
        env: {
            ...process.env, NOTES_TOKEN: "", NOTES_TOKEN_FILE: "", PORT: String(extraPort), HOST: "127.0.0.1",
            LOG_DIR: path.join(notesDir, `.server-logs-${extraPort}`), ...env
        }, stdio: ["ignore", "pipe", "pipe"]
    });
    let output = "";
    let errorOutput = "";
    process_.stdout.on("data", chunk => { output += chunk; });
    process_.stderr.on("data", chunk => { errorOutput += chunk; });
    const url = `http://127.0.0.1:${extraPort}`;
    const ready = (async () => {
        for (let attempt = 0; attempt < 50; attempt++) {
            try { await fetch(`${url}/`); return; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
        }
        throw new Error("Le serveur n’a pas démarré.");
    })();
    return { process: process_, url, ready, output: () => output, errorOutput: () => errorOutput };
}

test("refuse un jeton trop court quand le serveur écoute sur le réseau", () => {
    const { spawnSync } = require("node:child_process");
    const result = spawnSync(process.execPath, [script, notesDir], { env: { ...process.env, HOST: "0.0.0.0", NOTES_TOKEN: "court", NOTES_TOKEN_FILE: "" }, encoding: "utf8", timeout: 5000 });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /trop court/);
});

test("lit le jeton depuis NOTES_TOKEN_FILE et refuse les autres", async () => {
    const tokenFile = path.join(notesDir, "..", `token-${port}.txt`);
    fs.writeFileSync(tokenFile, `${longToken}\n`);
    const server = startServer({ HOST: "127.0.0.1", NOTES_TOKEN_FILE: tokenFile, NOTES_TOKEN: "ignoré" });
    try {
        await server.ready;
        const call = authorization => fetch(`${server.url}/api/list?path=`, { headers: authorization ? { Authorization: authorization } : {} });
        assert.equal((await call(`Bearer ${longToken}`)).status, 200);
        assert.equal((await call("Bearer ignoré")).status, 401);
        assert.equal((await call(`Bearer ${longToken}x`)).status, 401);
        assert.equal((await call(longToken)).status, 401);
        assert.equal((await call()).status, 401);
    } finally { await stopServer(server.process); fs.rmSync(tokenFile, { force: true }); }
});

test("refuse un fichier de jeton absent ou vide", () => {
    const { spawnSync } = require("node:child_process");
    const empty = path.join(notesDir, "..", `empty-${port}.txt`);
    fs.writeFileSync(empty, "  \n");
    try {
        for (const file of [empty, path.join(notesDir, "inexistant.txt")]) {
            const result = spawnSync(process.execPath, [script, notesDir], { env: { ...process.env, NOTES_TOKEN_FILE: file }, encoding: "utf8", timeout: 5000 });
            assert.equal(result.status, 1, file);
            assert.match(result.stderr, /fichier de jeton/i);
        }
    } finally { fs.rmSync(empty, { force: true }); }
});

test("génère un jeton aléatoire quand aucun n’est défini", async () => {
    const server = startServer({});
    try {
        await server.ready;
        assert.equal((await fetch(`${server.url}/api/list?path=`)).status, 401);
        const generated = server.errorOutput().match(/\b[0-9a-f]{64}\b/)?.[0];
        assert.ok(generated, "jeton affiché au démarrage");
        assert.equal((await fetch(`${server.url}/api/list?path=`, { headers: { Authorization: `Bearer ${generated}` } })).status, 200);
    } finally { await stopServer(server.process); }
});

test("limite les essais d’authentification et réinitialise le compteur après succès", async () => {
    const server = startServer({ NOTES_TOKEN: longToken });
    const request = authorization => fetch(`${server.url}/api/list?path=`, {
        headers: authorization ? { Authorization: authorization } : {}
    });
    try {
        await server.ready;
        for (let attempt = 0; attempt < 4; attempt++) assert.equal((await request("Bearer incorrect")).status, 401);
        assert.equal((await request(`Bearer ${longToken}`)).status, 200, "une authentification correcte réinitialise les échecs");
        for (let attempt = 0; attempt < 4; attempt++) assert.equal((await request("Bearer incorrect")).status, 401);
        const locked = await request("Bearer incorrect");
        assert.equal(locked.status, 429);
        assert.ok(Number(locked.headers.get("Retry-After")) > 0);
        assert.equal((await request(`Bearer ${longToken}`)).status, 429, "le verrouillage bloque aussi un jeton correct jusqu’à son expiration");
    } finally { await stopServer(server.process); }
});

test("écrit un journal JSONL détaillé sans jeton ni contenu des notes", async () => {
    const response = await api("file", { path: "log-check.md" }, { method: "PUT", body: "contenu confidentiel de test" });
    assert.equal(response.status, 204);
    const requestId = response.headers.get("x-request-id");
    assert.match(requestId, /^[\da-f-]{36}$/i);
    const logFile = path.join(notesDir, ".server-logs", "server.jsonl");
    let hasRequestLog = false;
    for (let attempt = 0; attempt < 40; attempt++) {
        if (fs.existsSync(logFile)) {
            const records = fs.readFileSync(logFile, "utf8").split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
            if (records.some(record => record.request_id === requestId)) {
                hasRequestLog = true;
                break;
            }
        }
        await new Promise(resolve => setTimeout(resolve, 25));
    }
    assert.ok(hasRequestLog, "la requête est journalisée");
    await stopServer(child);

    const logText = fs.readFileSync(logFile, "utf8");
    const records = logText.trim().split(/\r?\n/).map(line => JSON.parse(line));
    const write = records.find(record => record.event === "http.request.completed" && record.request_id === requestId);
    assert.ok(write);
    assert.equal(write.action, "note.write");
    assert.equal(write.resource_path, "log-check.md");
    assert.equal(write.authentication, "success");
    assert.equal(write.client_ip, "127.0.0.1");
    assert.equal(typeof write.duration_ms, "number");
    assert.ok(records.some(record => record.event === "server.started"));
    assert.ok(!logText.includes(token));
    assert.ok(!logText.includes("contenu confidentiel de test"));
    assert.ok(!logText.includes("# Salut é"));
});

test("fait tourner les fichiers JSONL en respectant les limites configurées", async () => {
    const server = startServer({ LOG_MAX_BYTES: "1024", LOG_BACKUPS: "2" });
    try {
        await server.ready;
        for (let index = 0; index < 40; index++) {
            const response = await fetch(`${server.url}/introuvable-${index}`, { headers: { "User-Agent": "u".repeat(300) } });
            assert.equal(response.status, 404);
            await response.text();
        }
    } finally { await stopServer(server.process); }

    const directory = path.join(notesDir, `.server-logs-${new URL(server.url).port}`);
    const currentLog = path.join(directory, "server.jsonl");
    assert.ok(fs.statSync(currentLog).size <= 1024);
    assert.ok(fs.existsSync(`${currentLog}.1`));
    assert.ok(fs.existsSync(`${currentLog}.2`));
    assert.ok(!fs.existsSync(`${currentLog}.3`));
});
