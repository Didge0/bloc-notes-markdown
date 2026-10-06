(() => {
    const homeView = document.getElementById("homeView");
    const editorView = document.getElementById("editorView");
    const editorHeader = document.getElementById("editorHeader");
    const togglePreviewButton = document.getElementById("btnTogglePreview");
    const actionsMenu = document.getElementById("editorActionsMenu");
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
    const chooseDirectoryButton = document.getElementById("btnChooseDirectory");
    const changeDirectoryButton = document.getElementById("btnChangeDirectory");
    let directoryHandle = null;
    let savedDirectoryHandle = null;
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
        editorView.classList.remove("preview-only");
        togglePreviewButton.setAttribute("aria-pressed", "false");
        togglePreviewButton.title = "Afficher l’aperçu seul";
        togglePreviewButton.querySelector("[aria-hidden='true']").textContent = "👁";
        togglePreviewButton.querySelector(".preview-toggle-label").textContent = "Aperçu seul";
        editor.focus();
    }

    function togglePreviewOnly() {
        const previewOnly = editorView.classList.toggle("preview-only");
        togglePreviewButton.setAttribute("aria-pressed", String(previewOnly));
        togglePreviewButton.title = previewOnly ? "Revenir au mode édition" : "Afficher l’aperçu seul";
        togglePreviewButton.querySelector("[aria-hidden='true']").textContent = previewOnly ? "✎" : "👁";
        togglePreviewButton.querySelector(".preview-toggle-label").textContent = previewOnly ? "Mode édition" : "Aperçu seul";
        if (!previewOnly) editor.focus();
    }

    function renderPreview() {
        preview.innerHTML = MarkdownRenderer.render(editor.value);
        const words = editor.value.trim().split(/\s+/u).filter(Boolean).length;
        wordCount.textContent = `Mots : ${words}`;
    }

    function updateTaskFromPreview(event) {
        const checkbox = event.target.closest("input[type='checkbox'][data-task-line]");
        if (!checkbox || !preview.contains(checkbox)) return;

        const lines = editor.value.split("\n");
        const lineIndex = Number(checkbox.dataset.taskLine);
        const taskLine = lines[lineIndex];
        const marker = taskLine?.match(/^(\s*[-*+]\s+\[)([ xX])(\]\s+.*)$/);
        if (!marker) return;

        const checkedMarker = checkbox.checked ? "x" : " ";
        lines[lineIndex] = `${marker[1]}${checkedMarker}${marker[3]}`;
        editor.value = lines.join("\n");
        renderPreview();
        scheduleAutoSave();
    }

    function updateDirectoryButtons(connected) {
        changeDirectoryButton.hidden = !savedDirectoryHandle;
        if (connected) {
            chooseDirectoryButton.textContent = "Changer de dossier";
            changeDirectoryButton.hidden = true;
        } else if (savedDirectoryHandle) {
            chooseDirectoryButton.textContent = `Autoriser l’accès à « ${savedDirectoryHandle.name} »`;
            changeDirectoryButton.hidden = false;
        } else {
            chooseDirectoryButton.textContent = "Choisir le dossier notes";
            changeDirectoryButton.hidden = true;
        }
    }

    function handleEditorEnter(event) {
        if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
        if (editor.selectionStart !== editor.selectionEnd) return;

        const value = editor.value;
        const caret = editor.selectionStart;
        const lineStart = value.lastIndexOf("\n", caret - 1) + 1;
        const nextLineBreak = value.indexOf("\n", caret);
        const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
        if (caret !== lineEnd) return;

        const line = value.slice(lineStart, lineEnd);
        const emptyTask = line.match(/^(\s*[-*+]\s+\[[ xX]\]\s*)$/);
        const emptyOrdered = line.match(/^(\s*)(\d+)([.)])\s*$/);
        const emptyBullet = line.match(/^\s*[-*+]\s*$/);
        if (emptyTask || emptyOrdered || emptyBullet) {
            event.preventDefault();
            editor.setRangeText("", lineStart, lineEnd, "end");
            editor.dispatchEvent(new Event("input", { bubbles: true }));
            return;
        }

        const task = line.match(/^(\s*[-*+]\s+)\[[ xX]\]\s+.*$/);
        const ordered = line.match(/^(\s*)(\d+)([.)])\s+.*$/);
        const bullet = line.match(/^(\s*[-*+]\s+).*$/);
        let continuation = "";

        if (task) continuation = `${task[1]}[ ] `;
        else if (ordered) continuation = `${ordered[1]}${Number(ordered[2]) + 1}${ordered[3]} `;
        else if (bullet) continuation = bullet[1];
        else return;

        event.preventDefault();
        editor.setRangeText(`\n${continuation}`, caret, caret, "end");
        editor.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function handleEditorBackspace(event) {
        if (event.key !== "Backspace" || editor.selectionStart !== editor.selectionEnd) return;

        const value = editor.value;
        const caret = editor.selectionStart;
        const lineStart = value.lastIndexOf("\n", caret - 1) + 1;
        const nextLineBreak = value.indexOf("\n", caret);
        const lineEnd = nextLineBreak === -1 ? value.length : nextLineBreak;
        if (caret !== lineEnd) return;

        const line = value.slice(lineStart, lineEnd);
        if (!/^(?:\s*[-*+]\s+\[[ xX]\]\s*|\s*[-*+]\s*|\s*\d+[.)]\s*)$/.test(line)) return;

        event.preventDefault();
        editor.setRangeText("", lineStart, lineEnd, "end");
        editor.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function handleEditorTab(event) {
        if (event.key !== "Tab") return;
        event.preventDefault();

        const value = editor.value;
        const selectionStart = editor.selectionStart;
        const selectionEnd = editor.selectionEnd;
        const indent = "    ";

        if (selectionStart === selectionEnd) {
            if (!event.shiftKey) {
                editor.setRangeText(indent, selectionStart, selectionEnd, "end");
            } else {
                const lineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
                const lineIndent = value.slice(lineStart).match(/^(?:\t| {1,4})/)?.[0];
                if (lineIndent) {
                    editor.setRangeText("", lineStart, lineStart + lineIndent.length, "preserve");
                }
            }
        } else {
            const firstLineStart = value.lastIndexOf("\n", selectionStart - 1) + 1;
            const lastSelectedPosition = selectionEnd > selectionStart && value[selectionEnd - 1] === "\n"
                ? selectionEnd - 1
                : Math.max(selectionStart, selectionEnd - 1);
            const lastLineStart = value.lastIndexOf("\n", lastSelectedPosition - 1) + 1;
            const segmentEnd = value.indexOf("\n", lastLineStart) === -1
                ? value.length
                : value.indexOf("\n", lastLineStart);
            const lines = value.slice(firstLineStart, segmentEnd).split("\n");
            const updatedLines = lines.map(line => {
                if (!event.shiftKey) return indent + line;
                return line.replace(/^(?:\t| {1,4})/, "");
            });
            const replacement = updatedLines.join("\n");
            editor.setRangeText(replacement, firstLineStart, segmentEnd, "select");
        }

        editor.dispatchEvent(new Event("input", { bubbles: true }));
    }

    async function refreshNotes() {
        if (!directoryHandle) return;
        const notes = await NoteFiles.listNotes(directoryHandle);
        notesList.replaceChildren();
        notesEmpty.hidden = notes.length > 0;
        notes.forEach(note => {
            const item = document.createElement("li");
            const row = document.createElement("div");
            const openButton = document.createElement("button");
            const title = document.createElement("span");
            const fileName = document.createElement("span");
            const deleteButton = document.createElement("button");
            row.className = "note-row";
            openButton.type = "button";
            openButton.className = "note-link";
            title.className = "note-title";
            fileName.className = "note-filename";
            deleteButton.type = "button";
            deleteButton.className = "note-delete";
            deleteButton.setAttribute("aria-label", `Supprimer ${note.name}`);
            deleteButton.title = `Supprimer ${note.name}`;
            deleteButton.textContent = "🗑";
            title.textContent = note.title;
            fileName.textContent = note.name;
            openButton.append(title, fileName);
            openButton.addEventListener("click", () => openNote(note.handle));
            deleteButton.addEventListener("click", () => deleteNote(note.name));
            row.append(openButton, deleteButton);
            item.append(row);
            notesList.append(item);
        });
        directoryStatus.textContent = `${notes.length} note${notes.length === 1 ? "" : "s"} dans ${directoryHandle.name}`;
        createButton.disabled = false;
    }

    async function deleteNote(fileName) {
        if (!directoryHandle || !window.confirm(`Supprimer définitivement « ${fileName} » ?`)) return;
        try {
            await NoteFiles.deleteNote(directoryHandle, fileName);
            await refreshNotes();
            showStatus(`Note « ${fileName} » supprimée`);
        } catch (error) {
            showStatus(error?.name === "NotAllowedError"
                ? "Accès refusé. Réautorisez le dossier pour supprimer cette note."
                : error.message || "Impossible de supprimer cette note.");
        }
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

    async function connectDirectory(handle, permissionGranted = false) {
        if (!permissionGranted) await requestDirectoryPermission(handle);
        directoryHandle = handle;
        savedDirectoryHandle = handle;
        updateDirectoryButtons(true);
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
        if (savedDirectoryHandle && !directoryHandle) {
            try {
                const permission = await savedDirectoryHandle.requestPermission({ mode: "readwrite" });
                if (permission !== "granted") throw new DOMException("Permission refusée", "NotAllowedError");
                await connectDirectory(savedDirectoryHandle, true);
                showStatus("Accès au dossier rétabli");
            } catch (error) {
                directoryStatus.textContent = `L’accès à « ${savedDirectoryHandle.name} » n’a pas été autorisé. Vous pouvez réessayer ou choisir un autre dossier.`;
                showStatus(error.message || "Impossible d’autoriser ce dossier");
            }
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

    async function chooseAnotherDirectory() {
        if (typeof window.showDirectoryPicker !== "function") return;
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

    editor.addEventListener("keydown", handleEditorEnter);
    editor.addEventListener("keydown", handleEditorBackspace);
    editor.addEventListener("keydown", handleEditorTab);
    preview.addEventListener("change", updateTaskFromPreview);
    editor.addEventListener("input", () => {
        renderPreview();
        scheduleAutoSave();
    });
    document.getElementById("btnBackHome").addEventListener("click", returnHome);
    togglePreviewButton.addEventListener("click", togglePreviewOnly);
    chooseDirectoryButton.addEventListener("click", chooseDirectory);
    changeDirectoryButton.addEventListener("click", chooseAnotherDirectory);
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
    actionsMenu.addEventListener("click", event => {
        if (event.target.closest("button")) actionsMenu.open = false;
    });
    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && actionsMenu.open) {
            actionsMenu.open = false;
            actionsMenu.querySelector("summary").focus();
        }
    });

    (async () => {
        if (typeof window.showDirectoryPicker !== "function") {
            directoryStatus.textContent = "Pour afficher les fichiers du dossier notes, utilisez Chrome ou Edge.";
            return;
        }
        try {
            const savedHandle = await NoteStorage.loadDirectory();
            if (!savedHandle) return;
            savedDirectoryHandle = savedHandle;
            if (await savedHandle.queryPermission({ mode: "readwrite" }) === "granted") {
                await connectDirectory(savedHandle, true);
            } else {
                updateDirectoryButtons(false);
                directoryStatus.textContent = `Le dossier « ${savedHandle.name} » est mémorisé. Autorisez l’accès pour afficher vos notes.`;
            }
        } catch {
            savedDirectoryHandle = null;
            updateDirectoryButtons(false);
            directoryStatus.textContent = "Choisissez votre dossier notes pour afficher vos fichiers Markdown.";
        }
    })();
})();