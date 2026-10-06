(() => {
    const homeView = document.getElementById("homeView");
    const editorView = document.getElementById("editorView");
    const editorHeader = document.getElementById("editorHeader");
    const editor = document.getElementById("editor");
    const preview = document.getElementById("preview");
    const fileNameInput = document.getElementById("fileName");
    const wordCount = document.getElementById("wordCount");
    const statusBar = document.getElementById("statusBar");
    const directoryStatus = document.getElementById("directoryStatus");
    const notesList = document.getElementById("notesList");
    const notesEmpty = document.getElementById("notesEmpty");
    const fileInput = document.getElementById("hiddenFileInput");
    const createButton = document.getElementById("btnCreateNote");
    let directoryHandle = null;
    let activeNote = null;
    let saveTimeout;
    let statusTimeout;
    let queuedWrite = Promise.resolve();
    let isReturning = false;

    function showStatus(message) {
        window.clearTimeout(statusTimeout);
        statusBar.textContent = message;
        statusTimeout = window.setTimeout(() => { statusBar.textContent = ""; }, 4000);
    }

    function showHome() {
        homeView.hidden = false;
        editorView.hidden = true;
        editorHeader.hidden = true;
    }

    function showEditor() {
        homeView.hidden = true;
        editorView.hidden = false;
        editorHeader.hidden = false;
        editor.focus();
    }

    function renderPreview() {
        preview.innerHTML = MarkdownRenderer.render(editor.value);
        const words = editor.value.trim().split(/\s+/u).filter(Boolean).length;
        wordCount.textContent = `Mots : ${words}`;
    }

    async function refreshNotes() {
        if (!directoryHandle) return;
        const notes = await NoteFiles.listNotes(directoryHandle);
        notesList.replaceChildren();
        notesEmpty.hidden = notes.length > 0;
        notes.forEach(note => {
            const item = document.createElement("li");
            const button = document.createElement("button");
            const title = document.createElement("span");
            const fileName = document.createElement("span");
            button.type = "button";
            button.className = "note-link";
            title.className = "note-title";
            fileName.className = "note-filename";
            title.textContent = note.title;
            fileName.textContent = note.name;
            button.append(title, fileName);
            button.addEventListener("click", () => openNote(note.handle));
            item.append(button);
            notesList.append(item);
        });
        directoryStatus.textContent = `${notes.length} note${notes.length === 1 ? "" : "s"} dans ${directoryHandle.name}`;
        createButton.disabled = false;
    }

    async function openNote(handle) {
        window.clearTimeout(saveTimeout);
        try {
            activeNote = await NoteFiles.readNote(handle);
            fileNameInput.value = activeNote.name.replace(/\.md$/i, "");
            editor.value = activeNote.content;
            renderPreview();
            showEditor();
        } catch {
            showStatus("Impossible d’ouvrir cette note. Vérifiez l’accès au dossier.");
        }
    }

    function saveActiveNote() {
        if (!activeNote) return Promise.resolve(false);
        const content = editor.value;
        queuedWrite = queuedWrite.catch(() => {}).then(() => NoteFiles.writeNote(activeNote.handle, content));
        return queuedWrite.then(() => true, error => {
            showStatus(error?.name === "NotAllowedError"
                ? "Accès en écriture refusé. Réautorisez le dossier et réessayez."
                : "La note n’a pas pu être enregistrée. Vous êtes toujours dans l’éditeur.");
            return false;
        });
    }

    function scheduleAutoSave() {
        window.clearTimeout(saveTimeout);
        if (!activeNote) return;
        showStatus("Modifications en attente d’enregistrement");
        saveTimeout = window.setTimeout(async () => {
            const saved = await saveActiveNote();
            if (saved) showStatus("Enregistré dans le dossier notes");
        }, 700);
    }

    async function returnHome() {
        if (isReturning) return;
        isReturning = true;
        const backButton = document.getElementById("btnBackHome");
        backButton.disabled = true;
        editor.disabled = true;
        window.clearTimeout(saveTimeout);
        try {
            const saved = await saveActiveNote();
            if (!saved) return;
            activeNote = null;
            showHome();
            try {
                await refreshNotes();
                showStatus("Modifications enregistrées");
            } catch {
                directoryStatus.textContent = "Le dossier n’est plus accessible. Choisissez-le à nouveau.";
                createButton.disabled = true;
            }
        } finally {
            isReturning = false;
            backButton.disabled = false;
            editor.disabled = false;
        }
    }

    function downloadMarkdown() {
        const name = activeNote?.name || "note.md";
        NoteFiles.download(name, editor.value, "text/markdown;charset=utf-8");
        showStatus("Copie Markdown téléchargée");
    }

    function downloadHtml() {
        const name = activeNote?.name.replace(/\.md$/i, "") || "note";
        const title = MarkdownRenderer.escapeHtml(name);
        const html = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { max-width: 900px; margin: 2rem auto; padding: 0 1.5rem; color: #333; font: 16px/1.6 sans-serif; }
        h1, h2, h3 { color: #8b3a3a; }
        pre { overflow-x: auto; padding: 1rem; background: #f5f5f5; }
        code { padding: .15rem .3rem; background: #f0e5e5; }
        pre code { padding: 0; background: transparent; }
        blockquote { border-left: 4px solid #8b3a3a; padding-left: 1rem; color: #666; }
        .task-list { list-style: none; padding-left: 0; }
        a { color: #8b3a3a; }
    </style>
</head>
<body>
    <h1>${title}</h1>
    ${preview.innerHTML}
</body>
</html>`;
        NoteFiles.download(`${name}.html`, html, "text/html;charset=utf-8");
        showStatus("Fichier HTML téléchargé");
    }

    async function requestDirectoryPermission(handle) {
        let permission = await handle.queryPermission({ mode: "readwrite" });
        if (permission !== "granted") permission = await handle.requestPermission({ mode: "readwrite" });
        if (permission !== "granted") throw new DOMException("Permission refusée", "NotAllowedError");
    }

    async function migrateLegacyNote() {
        if (NoteStorage.migrationHandled()) return;
        const legacy = NoteStorage.load();
        if (!legacy?.content.trim()) {
            NoteStorage.markMigrationHandled();
            return;
        }
        if (!window.confirm("Une ancienne note est enregistrée dans le navigateur. Voulez-vous l’ajouter au dossier notes ? La copie du navigateur sera conservée.")) {
            NoteStorage.markMigrationHandled();
            return;
        }

        let suggestedName = (legacy.fileName || "Ma note").replace(/\.md$/i, "");
        while (true) {
            const requestedName = window.prompt("Nom du nouveau fichier Markdown :", suggestedName);
            if (requestedName === null) return;
            try {
                const note = await NoteFiles.createNote(directoryHandle, requestedName);
                await NoteFiles.writeNote(note.handle, legacy.content);
                NoteStorage.markMigrationHandled();
                showStatus("Ancienne note ajoutée au dossier notes");
                return;
            } catch (error) {
                if (error.message !== "Une note porte déjà ce nom.") {
                    showStatus(error.message || "Impossible d’importer l’ancienne note");
                    return;
                }
                suggestedName = `${requestedName.trim()} (copie)`;
                showStatus("Ce nom existe déjà; choisissez-en un autre.");
            }
        }
    }

    async function connectDirectory(handle) {
        await requestDirectoryPermission(handle);
        directoryHandle = handle;
        await NoteStorage.saveDirectory(handle);
        await refreshNotes();
        await migrateLegacyNote();
        await refreshNotes();
    }

    async function chooseDirectory() {
        if (typeof window.showDirectoryPicker !== "function") {
            directoryStatus.textContent = "L’accès direct aux dossiers nécessite Chrome ou Edge. Vous pouvez utiliser l’import de fichier depuis un navigateur non compatible.";
            return;
        }
        try {
            const handle = await window.showDirectoryPicker({ mode: "readwrite", id: "markdown-notes" });
            await connectDirectory(handle);
            showStatus("Dossier connecté");
        } catch (error) {
            if (error.name !== "AbortError") showStatus(error.message || "Impossible d’accéder à ce dossier");
        }
    }

    async function createNote() {
        if (!directoryHandle) return;
        const requestedName = window.prompt("Nom de la nouvelle note :");
        if (requestedName === null) return;
        try {
            const note = await NoteFiles.createNote(directoryHandle, requestedName);
            await openNote(note.handle);
        } catch (error) {
            showStatus(error.message || "Impossible de créer cette note");
        }
    }

    editor.addEventListener("input", () => {
        renderPreview();
        scheduleAutoSave();
    });
    document.getElementById("btnBackHome").addEventListener("click", returnHome);
    document.getElementById("btnChooseDirectory").addEventListener("click", chooseDirectory);
    createButton.addEventListener("click", createNote);

    document.getElementById("btnOpenFile").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
        const file = fileInput.files[0];
        if (!file) return;
        try {
            editor.value = await file.text();
            renderPreview();
            scheduleAutoSave();
            showStatus("Fichier importé; les modifications seront enregistrées dans la note courante");
        } catch {
            showStatus("Impossible de lire ce fichier");
        } finally {
            fileInput.value = "";
        }
    });

    document.getElementById("btnDownloadMd").addEventListener("click", downloadMarkdown);
    document.getElementById("btnDownloadHtml").addEventListener("click", downloadHtml);
    document.getElementById("btnPrint").addEventListener("click", () => window.print());

    (async () => {
        if (typeof window.showDirectoryPicker !== "function") {
            directoryStatus.textContent = "Pour afficher les fichiers du dossier notes, utilisez Chrome ou Edge.";
            return;
        }
        try {
            const savedHandle = await NoteStorage.loadDirectory();
            if (!savedHandle) return;
            if (await savedHandle.queryPermission({ mode: "readwrite" }) === "granted") {
                directoryHandle = savedHandle;
                await refreshNotes();
                await migrateLegacyNote();
                await refreshNotes();
            } else {
                directoryStatus.textContent = `Le dossier « ${savedHandle.name} » est mémorisé. Choisissez-le à nouveau pour autoriser l’accès.`;
            }
        } catch {
            directoryStatus.textContent = "Choisissez votre dossier notes pour afficher vos fichiers Markdown.";
        }
    })();
})();