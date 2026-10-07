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
            for (const folder of folders.values()) yield folder;
        },
        async getFileHandle(name) {
            if (files.has(name)) throw new Error("Le test ne doit pas écraser un fichier.");
            return makeHandle(name);
        },
        async getDirectoryHandle(name, options) {
            if (folders.has(name)) throw new Error("Le dossier existe déjà.");
            if (!options?.create) throw new Error("Le dossier est introuvable.");
            const folder = { kind: "directory", name };
            folders.set(name, folder);
            return folder;
        },
        async removeEntry(name) {
            if (!files.delete(name)) throw new Error("Fichier introuvable");
        }
    };
    const folders = new Map([["sous-dossier", { kind: "directory", name: "sous-dossier" }]]);
    const checks = [];
    const notes = await NoteFiles.listNotes(directory);
    checks.push(["filtre les fichiers Markdown", notes.length === 1 && notes[0].name === "Zeta.md"]);
    const contents = await NoteFiles.listDirectory(directory);
    checks.push(["liste séparément notes et dossiers", contents.notes.length === 1 && contents.directories[0]?.name === "sous-dossier"]);
    const createdFolder = await NoteFiles.createFolder(directory, "Compte-rendu");
    checks.push(["crée un sous-dossier", createdFolder.name === "Compte-rendu" && folders.has("Compte-rendu")]);
    let duplicateFolderRejected = false;
    try { await NoteFiles.createFolder(directory, "sous-dossier"); } catch { duplicateFolderRejected = true; }
    checks.push(["refuse un dossier déjà existant", duplicateFolderRejected]);
    let invalidFolderRejected = false;
    try { await NoteFiles.createFolder(directory, "../interdit"); } catch { invalidFolderRejected = true; }
    checks.push(["refuse un nom de dossier invalide", invalidFolderRejected]);
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

    function makeMemoryDirectory(name, initialFiles = {}) {
        const entries = new Map();
        const makeMemoryFile = (fileName, initialContent) => {
            let content = initialContent;
            return {
                kind: "file",
                name: fileName,
                async getFile() { return { name: fileName, async text() { return typeof content === "string" ? content : await content.text(); } }; },
                async createWritable() {
                        return { async write(value) { content = value; }, async close() {}, async abort() {} };
                }
            };
        };
        for (const [fileName, content] of Object.entries(initialFiles)) entries.set(fileName, makeMemoryFile(fileName, content));
        return {
            kind: "directory",
            name,
            entries,
            async *values() { yield* entries.values(); },
            async getFileHandle(fileName, options) {
                let entry = entries.get(fileName);
                if (entry && entry.kind !== "file") throw new Error("Un dossier porte déjà ce nom.");
                if (!entry && options?.create) {
                    entry = makeMemoryFile(fileName, "");
                    entries.set(fileName, entry);
                }
                if (!entry) throw new Error("Fichier introuvable.");
                return entry;
            },
            async getDirectoryHandle(directoryName, options) {
                let entry = entries.get(directoryName);
                if (entry && entry.kind !== "directory") throw new Error("Un fichier porte déjà ce nom.");
                if (!entry && options?.create) {
                    entry = makeMemoryDirectory(directoryName);
                    entries.set(directoryName, entry);
                }
                if (!entry) throw new Error("Dossier introuvable.");
                return entry;
            },
            async removeEntry(entryName, options) {
                const entry = entries.get(entryName);
                if (!entry) throw new Error("Entrée introuvable.");
                if (entry.kind === "directory" && entry.entries.size && !options?.recursive) throw new Error("Le dossier n’est pas vide.");
                entries.delete(entryName);
            }
        };
    }
    const sourceDirectory = makeMemoryDirectory("source", { "Transfert.md": "# Contenu à conserver" });
    const targetDirectory = makeMemoryDirectory("destination");
    await NoteFiles.moveNote(sourceDirectory, "Transfert.md", targetDirectory);
    checks.push(["déplace une note sans perdre son contenu", !sourceDirectory.entries.has("Transfert.md") && await (await targetDirectory.entries.get("Transfert.md").getFile()).text() === "# Contenu à conserver"]);
    const collisionSource = makeMemoryDirectory("source-bis", { "Déjà-là.md": "source" });
    const collisionTarget = makeMemoryDirectory("destination-bis", { "Déjà-là.md": "destination" });
    let moveCollisionRejected = false;
    try { await NoteFiles.moveNote(collisionSource, "Déjà-là.md", collisionTarget); } catch { moveCollisionRejected = true; }
    checks.push(["refuse d’écraser une note à la destination", moveCollisionRejected && collisionSource.entries.has("Déjà-là.md") && await (await collisionTarget.entries.get("Déjà-là.md").getFile()).text() === "destination"]);
    checks.push(["ignore le déplacement vers le même dossier", (await NoteFiles.moveNote(collisionSource, "Déjà-là.md", collisionSource)).moved === false]);

    const preserveParent = makeMemoryDirectory("parent");
    const preserveFolder = makeMemoryDirectory("Archives", { "garde.md": "# À garder", "info.txt": "Texte conservé" });
    const nestedFolder = makeMemoryDirectory("Sous-dossier", { "imbrique.md": "# Imbriqué" });
    preserveFolder.entries.set(nestedFolder.name, nestedFolder);
    preserveParent.entries.set(preserveFolder.name, preserveFolder);
    await NoteFiles.deleteFolder(preserveParent, "Archives", true);
    const preservedNestedFolder = preserveParent.entries.get("Sous-dossier");
    checks.push(["supprime un dossier en remontant tout son contenu", !preserveParent.entries.has("Archives") && await (await preserveParent.entries.get("garde.md").getFile()).text() === "# À garder" && await (await preserveParent.entries.get("info.txt").getFile()).text() === "Texte conservé" && await (await preservedNestedFolder.entries.get("imbrique.md").getFile()).text() === "# Imbriqué"]);
    const collisionParent = makeMemoryDirectory("parent-conflit", { "garde.md": "Version parent" });
    const collisionFolder = makeMemoryDirectory("À supprimer", { "garde.md": "Version dossier" });
    collisionParent.entries.set(collisionFolder.name, collisionFolder);
    let folderCollisionRejected = false;
    try { await NoteFiles.deleteFolder(collisionParent, "À supprimer", true); } catch { folderCollisionRejected = true; }
    checks.push(["protège les contenus en cas de nom déjà présent", folderCollisionRejected && collisionParent.entries.get("À supprimer") === collisionFolder && await (await collisionParent.entries.get("garde.md").getFile()).text() === "Version parent"]);
    const deleteParent = makeMemoryDirectory("parent-suppression");
    deleteParent.entries.set("Corbeille", makeMemoryDirectory("Corbeille", { "perdu.md": "à effacer" }));
    await NoteFiles.deleteFolder(deleteParent, "Corbeille");
    checks.push(["supprime récursivement un dossier et son contenu", !deleteParent.entries.has("Corbeille")]);

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

    const folderHandle = {};
    const rootHandle = {};
    const folderCreateButton = document.createElement("button");
    const nestedNote = { name: "detail.md", title: "Détail", handle: {} };
    const rootNote = { name: "racine.md", title: "Racine", handle: {} };
    const innerFolderHandle = {};
    const deepNote = { name: "profond.md", title: "Profond", handle: {} };
    let loadedFolder = null;
    let createdInFolder = null;
    let requestedFolderDeletion = null;
    const movedNotes = [];
    NoteHomeView.renderNotes({
        list: notesList,
        emptyState: notesEmpty,
        directoryStatus,
        createButton,
        createFolderButton: folderCreateButton,
        notes: [rootNote],
        folders: [{ name: "Archives", handle: folderHandle }],
        directoryHandle: rootHandle,
        directoryName: "notes",
        onOpen() {},
        onLoadFolder(handle) {
            loadedFolder = handle;
            return Promise.resolve(handle === folderHandle
                ? { notes: [nestedNote], folders: [{ name: "Sous-archives", handle: innerFolderHandle }] }
                : { notes: [deepNote], folders: [] });
        },
        onCreateNote(handle) { createdInFolder = handle; },
        onMoveNote(name, source, target) {
            movedNotes.push({ name, source, target });
            return Promise.resolve(name === "racine.md" ? rootNote : nestedNote);
        },
        onDeleteFolder(name, parent) { requestedFolderDeletion = { name, parent }; },
        onDelete() {},
        onRename() {},
        onReorder() {}
    });
    const folderToggle = notesList.querySelector(".folder-link");
    folderToggle.click();
    await new Promise(resolve => setTimeout(resolve, 0));
    checks.push(["déplie un dossier sans naviguer", loadedFolder === folderHandle && notesList.querySelector(".folder-link").getAttribute("aria-expanded") === "true"]);
    const nestedNoteItem = notesList.querySelector('[data-note-name="detail.md"]');
    checks.push(["affiche les notes dans le dossier déplié", Boolean(nestedNoteItem)]);
    checks.push(["indente les notes dans le dossier déplié", nestedNoteItem?.style.getPropertyValue("--folder-depth") === "1"]);
    [...notesList.querySelectorAll(".folder-link")].find(button => button.textContent.includes("Sous-archives")).click();
    await new Promise(resolve => setTimeout(resolve, 0));
    const deepNoteItem = notesList.querySelector('[data-note-name="profond.md"]');
    checks.push(["ajoute un niveau d’indentation aux dossiers imbriqués", deepNoteItem?.style.getPropertyValue("--folder-depth") === "2"]);
    notesList.querySelector(".folder-create-note").click();
    checks.push(["crée une note dans le dossier ciblé", createdInFolder === folderHandle]);
    notesList.querySelector(".folder-delete").click();
    checks.push(["demande la suppression du dossier et transmet son parent", requestedFolderDeletion?.name === "Archives" && requestedFolderDeletion.parent === rootHandle]);
    checks.push(["un dossier seul masque l’état vide", notesEmpty.hidden]);
    const rootNoteGrip = notesList.querySelector('[data-note-name="racine.md"] .note-drag-handle');
    const moveRootToFolder = new DataTransfer();
    rootNoteGrip.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: moveRootToFolder }));
    notesList.querySelector(".folder-item").dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: moveRootToFolder }));
    await new Promise(resolve => setTimeout(resolve, 0));
    checks.push(["déplace une note vers un dossier", movedNotes[0]?.name === "racine.md" && movedNotes[0]?.source === rootHandle && movedNotes[0]?.target === folderHandle]);
    checks.push(["affiche la note déplacée dans le dossier cible", notesList.querySelector('[data-note-name="racine.md"]')?.parentElement?.parentElement?.classList.contains("folder-item")]);
    const nestedNoteGrip = notesList.querySelector('[data-note-name="detail.md"] .note-drag-handle');
    const moveNestedToRoot = new DataTransfer();
    nestedNoteGrip.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: moveNestedToRoot }));
    directoryStatus.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: moveNestedToRoot }));
    await new Promise(resolve => setTimeout(resolve, 0));
    checks.push(["retire une note d’un dossier vers la racine", movedNotes[1]?.name === "detail.md" && movedNotes[1]?.source === folderHandle && movedNotes[1]?.target === rootHandle]);
    checks.push(["affiche la note retirée à la racine", notesList.querySelector('[data-note-name="detail.md"]')?.parentElement === notesList]);
    notesList.querySelector(".folder-link").click();
    checks.push(["replie un dossier déjà ouvert", notesList.querySelector(".folder-link").getAttribute("aria-expanded") === "false"]);
    renderTestNotes();

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