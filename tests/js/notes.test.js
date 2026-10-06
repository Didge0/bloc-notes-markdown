(async () => {
    const files = new Map();
    function makeHandle(name, initialContent = "") {
        let content = initialContent;
        return {
            kind: "file",
            name,
            async getFile() {
                return { name, lastModified: 0, async text() { return content; } };
            },
            async createWritable() {
                return {
                    async write(value) { content = value; files.set(name, content); },
                    async close() {},
                    async abort() {}
                };
            }
        };
    }

    files.set("Zeta.md", "Sans titre");
    const directory = {
        async *values() {
            for (const [name, content] of files) yield makeHandle(name, content);
            yield { kind: "file", name: "ignore.txt" };
            yield { kind: "directory", name: "sous-dossier" };
        },
        async getFileHandle(name) {
            if (files.has(name)) throw new Error("Le test ne doit pas écraser un fichier.");
            return makeHandle(name);
        },
        async removeEntry(name) {
            if (!files.delete(name)) throw new Error("Fichier introuvable");
        }
    };
    const checks = [];
    const notes = await NoteFiles.listNotes(directory);
    checks.push(["filtre les fichiers Markdown", notes.length === 1 && notes[0].name === "Zeta.md"]);
    checks.push(["utilise le nom sans H1", notes[0]?.title === "Zeta"]);
    checks.push(["extrait le premier H1", NoteFiles.getTitle("# Titre\n\nTexte", "note.md") === "Titre"]);
    checks.push(["retombe sur le nom si le H1 est vide", NoteFiles.getTitle("#   ", "note.md") === "note"]);
    const created = await NoteFiles.createNote(directory, "Alpha");
    await NoteFiles.writeNote(created.handle, "# Nouveau contenu");
    checks.push(["crée et écrit un fichier Markdown", files.get("Alpha.md") === "# Nouveau contenu"]);
    let duplicateRejected = false;
    try { await NoteFiles.createNote(directory, "alpha.md"); } catch { duplicateRejected = true; }
    checks.push(["refuse un nom existant sans l’écraser", duplicateRejected && files.get("Alpha.md") === "# Nouveau contenu"]);
    let invalidNameRejected = false;
    try { await NoteFiles.createNote(directory, "../interdit"); } catch { invalidNameRejected = true; }
    checks.push(["refuse les noms de fichier invalides", invalidNameRejected]);
    await NoteFiles.deleteNote(directory, "Alpha.md");
    checks.push(["supprime la note Markdown ciblée", !files.has("Alpha.md")]);
    let nonMarkdownRejected = false;
    try { await NoteFiles.deleteNote(directory, "ignore.txt"); } catch { nonMarkdownRejected = true; }
    checks.push(["refuse la suppression d’un fichier non Markdown", nonMarkdownRejected]);

    const notesList = document.createElement("ul");
    notesList.className = "notes-list";
    document.body.append(notesList);
    const notesEmpty = document.createElement("div");
    const directoryStatus = document.createElement("p");
    const createButton = document.createElement("button");
    const noteEntries = ["Alpha.md", "Bravo.md", "Charlie.md"].map(name => ({
        name,
        title: name.replace(".md", ""),
        handle: {}
    }));
    let noteOrder = noteEntries.map(note => note.name);
    function renderTestNotes() {
        const orderedNotes = noteOrder.map(name => noteEntries.find(note => note.name === name));
        NoteHomeView.renderNotes({
            list: notesList,
            emptyState: notesEmpty,
            directoryStatus,
            createButton,
            notes: orderedNotes,
            directoryName: "test",
            onOpen() {},
            onDelete() {},
            onReorder(order) { noteOrder = order; renderTestNotes(); }
        });
    }
    const visibleOrder = () => [...notesList.querySelectorAll("li")].map(item => item.dataset.noteName);
    renderTestNotes();
    checks.push(["affiche une poignée de déplacement accessible", Boolean(notesList.querySelector(".note-drag-handle[draggable='true'][aria-keyshortcuts] .drag-grip-icon"))]);

    const alphaGrip = notesList.querySelector('[data-note-name="Alpha.md"] .note-drag-handle');
    const charlieRow = notesList.querySelector('[data-note-name="Charlie.md"]');
    const alphaToCharlie = new DataTransfer();
    alphaGrip.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: alphaToCharlie }));
    const charlieBounds = charlieRow.getBoundingClientRect();
    charlieRow.dispatchEvent(new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: alphaToCharlie,
        clientY: charlieBounds.top + 1
    }));
    checks.push(["dépose une note au-dessus de la cible", visibleOrder().join(",") === "Bravo.md,Alpha.md,Charlie.md"]);

    const charlieGrip = notesList.querySelector('[data-note-name="Charlie.md"] .note-drag-handle');
    const bravoRow = notesList.querySelector('[data-note-name="Bravo.md"]');
    const charlieToBravo = new DataTransfer();
    charlieGrip.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: charlieToBravo }));
    const bravoBounds = bravoRow.getBoundingClientRect();
    bravoRow.dispatchEvent(new DragEvent("drop", {
        bubbles: true,
        cancelable: true,
        dataTransfer: charlieToBravo,
        clientY: bravoBounds.bottom - 1
    }));
    checks.push(["dépose une note au-dessous de la cible", visibleOrder().join(",") === "Bravo.md,Charlie.md,Alpha.md"]);

    const alphaKeyboardGrip = notesList.querySelector('[data-note-name="Alpha.md"] .note-drag-handle');
    alphaKeyboardGrip.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true, cancelable: true }));
    checks.push(["déplace une note avec les flèches clavier", visibleOrder().join(",") === "Bravo.md,Alpha.md,Charlie.md"]);
    renderTestNotes();
    checks.push(["conserve l’ordre réorganisé au rerendu", visibleOrder().join(",") === noteOrder.join(",")]);

    const shortcutEditor = document.createElement("textarea");
    document.body.append(shortcutEditor);
    let saveShortcutCount = 0;
    NoteEditorInput.bind(shortcutEditor, () => { saveShortcutCount += 1; });
    const ctrlSave = new KeyboardEvent("keydown", { key: "s", ctrlKey: true, bubbles: true, cancelable: true });
    shortcutEditor.dispatchEvent(ctrlSave);
    checks.push(["intercepte Ctrl+S pour la sauvegarde", ctrlSave.defaultPrevented && saveShortcutCount === 1]);
    const plainS = new KeyboardEvent("keydown", { key: "s", bubbles: true, cancelable: true });
    shortcutEditor.dispatchEvent(plainS);
    checks.push(["laisse la touche S sans modificateur inchangée", !plainS.defaultPrevented && saveShortcutCount === 1]);
    const commandSave = new KeyboardEvent("keydown", { key: "s", metaKey: true, bubbles: true, cancelable: true });
    shortcutEditor.dispatchEvent(commandSave);
    checks.push(["intercepte Cmd+S sur clavier Mac", commandSave.defaultPrevented && saveShortcutCount === 2]);
    shortcutEditor.remove();

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
    notesList.remove();
})();