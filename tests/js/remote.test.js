(async () => {
    // Faux serveur en mémoire : même contrat que server/server.js, sans réseau.
    const files = new Map();
    const dirs = new Set([""]);
    const requests = [];
    const respond = (status, body = null, headers = {}) => new Response(body, { status, headers });
    const json = (status, value) => respond(status, JSON.stringify(value), { "Content-Type": "application/json" });
    const parentOf = path => path.split("/").slice(0, -1).join("/");

    window.fetch = async (url, init = {}) => {
        const parsed = new URL(url);
        const route = parsed.pathname.replace("/api/", "");
        const path = parsed.searchParams.get("path") || "";
        const method = init.method || "GET";
        requests.push({ route, path, method, authorization: init.headers?.Authorization });
        if (init.headers?.Authorization !== "Bearer secret") return json(401, { error: "Authentification requise." });
        if (route === "list") {
            if (!dirs.has(path)) return json(404, { error: "Dossier introuvable." });
            const prefix = path ? `${path}/` : "";
            const entries = [];
            for (const [name, content] of files) if (parentOf(name) === path) entries.push({ name: name.slice(prefix.length), kind: "file", modified: 5, size: content.length });
            for (const dir of dirs) if (dir && parentOf(dir) === path) entries.push({ name: dir.slice(prefix.length), kind: "directory" });
            return json(200, entries);
        }
        if (route === "stat") {
            if (dirs.has(path)) return json(200, { kind: "directory" });
            if (files.has(path)) return json(200, { kind: "file" });
            return json(404, { error: "Introuvable." });
        }
        if (route === "file" && method === "GET") return files.has(path) ? respond(200, files.get(path), { "X-Modified": "42" }) : json(404, { error: "Fichier introuvable." });
        if (route === "file" && method === "PUT") { files.set(path, init.body); return respond(204); }
        if (route === "dir") { dirs.add(path); return respond(204); }
        if (route === "entry") {
            files.delete(path);
            for (const dir of [...dirs]) if (dir === path || dir.startsWith(`${path}/`)) dirs.delete(dir);
            return respond(204);
        }
        return json(404, { error: "Route inconnue." });
    };

    const checks = [];
    let rejectedWithoutToken = false;
    try { await RemoteBackend.connect({ baseUrl: "http://serveur", token: "mauvais" }); } catch (error) { rejectedWithoutToken = error.name === "NotAllowedError"; }
    checks.push(["refuse un jeton invalide", rejectedWithoutToken]);

    const { root } = await RemoteBackend.connect({ baseUrl: "http://serveur/", token: "secret" });
    checks.push(["envoie le jeton en en-tête Bearer", requests.at(-1).authorization === "Bearer secret"]);
    checks.push(["se connecte à la racine du serveur", root.remote === true && root.kind === "directory" && root.path === ""]);

    const created = await NoteFiles.createNote(root, "Alpha");
    await NoteFiles.writeNote(created.handle, "# Titre\n\nTexte");
    checks.push(["crée et écrit une note sur le serveur", files.get("Alpha.md") === "# Titre\n\nTexte"]);
    const read = await NoteFiles.readNote(created.handle);
    checks.push(["relit le contenu de la note", read.content === "# Titre\n\nTexte" && read.name === "Alpha.md"]);

    const folder = await NoteFiles.createFolder(root, "Projets");
    checks.push(["crée un sous-dossier", dirs.has("Projets") && folder.handle.path === "Projets"]);
    const listing = await NoteFiles.listDirectory(root);
    checks.push(["liste notes et dossiers", listing.notes.length === 1 && listing.notes[0].title === "Titre" && listing.directories[0]?.name === "Projets"]);

    let duplicateRejected = false;
    try { await NoteFiles.createNote(root, "alpha"); } catch { duplicateRejected = true; }
    checks.push(["refuse un nom déjà utilisé", duplicateRejected]);

    const renamed = await NoteFiles.renameNote(root, "Alpha.md", "Beta");
    checks.push(["renomme une note", renamed.name === "Beta.md" && files.has("Beta.md") && !files.has("Alpha.md")]);

    const moved = await NoteFiles.moveNote(root, "Beta.md", folder.handle);
    checks.push(["déplace une note dans un sous-dossier", moved.moved && files.has("Projets/Beta.md") && !files.has("Beta.md")]);
    const sameMove = await NoteFiles.moveNote(folder.handle, "Beta.md", new root.constructor("Projets"));
    checks.push(["reconnaît le même dossier (pas de déplacement)", sameMove.moved === false]);

    await NoteFiles.deleteNote(folder.handle, "Beta.md");
    checks.push(["supprime une note", !files.has("Projets/Beta.md")]);

    await NoteFiles.createNote(folder.handle, "Interne");
    await NoteFiles.deleteFolder(root, "Projets", true);
    checks.push(["supprime un dossier en remontant son contenu", !dirs.has("Projets") && files.has("Interne.md")]);

    let missingRejected = false;
    try { await root.getFileHandle("absent.md"); } catch (error) { missingRejected = error.name === "NotFoundError"; }
    checks.push(["signale un fichier absent par NotFoundError", missingRejected]);

    let rateLimited = false;
    window.fetch = async () => new Response(JSON.stringify({ error: "Trop de tentatives." }), { status: 429, headers: { "Retry-After": "30" } });
    try { await root.getFileHandle("x.md"); } catch (error) { rateLimited = /30 secondes/.test(error.message); }
    checks.push(["indique le délai après trop de tentatives", rateLimited]);

    let unreachable = false;
    window.fetch = async () => { throw new TypeError("network"); };
    try { await root.getFileHandle("x.md"); } catch (error) { unreachable = /injoignable/i.test(error.message); }
    checks.push(["signale un serveur injoignable", unreachable]);

    let failures = 0;
    const results = document.getElementById("results");
    for (const [label, passed] of checks) {
        const item = document.createElement("li");
        item.className = passed ? "pass" : "fail";
        item.textContent = `${passed ? "OK" : "ÉCHEC"} : ${label}`;
        results.append(item);
        if (!passed) failures += 1;
    }
    const summary = document.getElementById("summary");
    summary.textContent = `${checks.length - failures}/${checks.length} tests réussis`;
    summary.className = failures ? "fail" : "pass";
})();
