"use strict";
// Lancer avec : node --test tests/server.test.js
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const port = 3900 + Math.floor(Math.random() * 90);
const base = `http://127.0.0.1:${port}`;
const token = "test-token";
let child;
let notesDir;
const auth = { Authorization: `Bearer ${token}` };
const api = (route, query, options = {}) => fetch(`${base}/api/${route}?${new URLSearchParams(query)}`, { ...options, headers: { ...auth, ...options.headers } });

before(async () => {
    notesDir = fs.mkdtempSync(path.join(os.tmpdir(), "notes-test-"));
    child = spawn(process.execPath, [path.join(__dirname, "..", "server", "server.js"), notesDir], {
        env: { ...process.env, PORT: String(port), HOST: "127.0.0.1", NOTES_TOKEN: token }, stdio: "ignore"
    });
    for (let attempt = 0; attempt < 50; attempt++) {
        try { await fetch(`${base}/`); return; } catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    throw new Error("Le serveur n’a pas démarré.");
});

after(() => {
    child.kill();
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
    const script = path.join(__dirname, "..", "server", "server.js");
    const env = { ...process.env, NOTES_DIR: "" };
    const withoutPath = spawnSync(process.execPath, [script], { env, encoding: "utf8", timeout: 5000 });
    assert.equal(withoutPath.status, 1);
    assert.match(withoutPath.stderr, /obligatoire/);
    const missing = spawnSync(process.execPath, [script, path.join(notesDir, "inexistant")], { env, encoding: "utf8", timeout: 5000 });
    assert.equal(missing.status, 1);
    assert.match(missing.stderr, /n’existe pas/);
});
