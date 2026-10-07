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
    let isRenaming = false;

    function showStatus(message) {
        window.clearTimeout(statusTimeout);
        statusBar.textContent = message;
        statusBar.hidden = false;
        statusTimeout = window.setTimeout(() => {
            statusBar.textContent = "";
            statusBar.hidden = true;
        }, 4000);
    }

    function showHome() {
        homeView.hidden = false;
        editorView.hidden = true;
        editorHeader.hidden = true;
    }

    function showEditor() {
        NoteEditorView.showEditor({ home: homeView, editorView, header: editorHeader, editor, previewToggle: togglePreviewButton });
    }

    function renderPreview() {
        NoteEditorView.renderMarkdown(editor, preview, wordCount);
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

    async function refreshNotes() {
        if (!directoryHandle) return;
        const listedNotes = await NoteFiles.listNotes(directoryHandle);
        let savedOrder = [];
        try { savedOrder = await NoteStorage.loadNoteOrder(directoryHandle); }
        catch { showStatus("Impossible de charger l’ordre enregistré des notes"); }
        const notesByName = new Map(listedNotes.map(note => [note.name, note]));
        const notes = savedOrder.map(name => notesByName.get(name)).filter(Boolean);
        const alreadyOrdered = new Set(notes.map(note => note.name));
        notes.push(...listedNotes.filter(note => !alreadyOrdered.has(note.name)));
        NoteHomeView.renderNotes({
            list: notesList,
            emptyState: notesEmpty,
            directoryStatus,
            createButton,
            notes,
            directoryName: directoryHandle.name,
            onOpen: openNote,
            onDelete: deleteNote,
            onRename: renameFromList,
            onReorder: async order => {
                try {
                    await NoteStorage.saveNoteOrder(directoryHandle, order);
                    await refreshNotes();
                    showStatus("Ordre des notes enregistré");
                } catch {
                    showStatus("Impossible d’enregistrer l’ordre des notes");
                }
            }
        });
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

    async function renameNoteFile(oldName, requestedName) {
        const renamed = await NoteFiles.renameNote(directoryHandle, oldName, requestedName);
        if (renamed.name !== oldName) {
            try {
                const order = await NoteStorage.loadNoteOrder(directoryHandle);
                await NoteStorage.saveNoteOrder(directoryHandle, order.map(name => name === oldName ? renamed.name : name));
            } catch { /* l'ordre sera simplement recalculé */ }
        }
        return renamed;
    }

    function renameErrorMessage(error) {
        return error?.name === "NotAllowedError"
            ? "Accès refusé. Réautorisez le dossier pour renommer cette note."
            : error.message || "Impossible de renommer cette note.";
    }

    async function renameFromList(fileName) {
        if (!directoryHandle) return;
        const requestedName = window.prompt("Nouveau nom de la note :", fileName.replace(/\.md$/i, ""));
        if (requestedName === null) return;
        try {
            await renameNoteFile(fileName, requestedName);
            await refreshNotes();
            showStatus("Note renommée");
        } catch (error) {
            showStatus(renameErrorMessage(error));
        }
    }

    async function renameActiveNote() {
        if (!activeNote || !directoryHandle || isRenaming) return;
        const currentBase = activeNote.name.replace(/\.md$/i, "");
        if (fileNameInput.value.trim() === currentBase) return;
        isRenaming = true;
        try {
            if (!await saveNow()) {
                fileNameInput.value = currentBase;
                return;
            }
            const renamed = await renameNoteFile(activeNote.name, fileNameInput.value);
            activeNote = { ...activeNote, name: renamed.name, handle: renamed.handle };
            fileNameInput.value = renamed.name.replace(/\.md$/i, "");
            showStatus("Note renommée");
        } catch (error) {
            fileNameInput.value = currentBase;
            showStatus(renameErrorMessage(error));
        } finally {
            isRenaming = false;
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

    async function saveNow() {
        window.clearTimeout(saveTimeout);
        if (!activeNote) return false;
        const saved = await saveActiveNote();
        if (saved) showStatus("Note enregistrée");
        return saved;
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
        const html = NoteHtmlExport.build(name, preview);
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

    NoteEditorInput.bind(editor, saveNow);
    NoteEditorView.bindTaskChanges(editor, preview, wordCount, scheduleAutoSave);
    NoteEditorView.bindHeadingCollapse(preview);
    editor.addEventListener("input", () => {
        renderPreview();
        scheduleAutoSave();
    });
    document.getElementById("btnBackHome").addEventListener("click", returnHome);
    fileNameInput.addEventListener("change", renameActiveNote);
    fileNameInput.addEventListener("keydown", event => {
        if (event.key === "Enter") fileNameInput.blur();
        if (event.key === "Escape" && activeNote) {
            fileNameInput.value = activeNote.name.replace(/\.md$/i, "");
            fileNameInput.blur();
        }
    });
    togglePreviewButton.addEventListener("click", () => NoteEditorView.togglePreviewOnly(editorView, togglePreviewButton, editor));
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