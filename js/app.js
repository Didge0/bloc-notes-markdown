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
    const createFolderButton = document.getElementById("btnCreateFolder");
    const chooseDirectoryButton = document.getElementById("btnChooseDirectory");
    const changeDirectoryButton = document.getElementById("btnChangeDirectory");
    const connectServerButton = document.getElementById("btnConnectServer");
    const deleteFolderDialog = document.getElementById("deleteFolderDialog");
    const deleteFolderDialogTitle = document.getElementById("deleteFolderDialogTitle");
    const deleteFolderDialogMessage = document.getElementById("deleteFolderDialogMessage");
    const deleteFolderDialogFeedback = document.getElementById("deleteFolderDialogFeedback");
    const deleteFolderKeepButton = document.getElementById("btnDeleteFolderKeep");
    const deleteFolderAllButton = document.getElementById("btnDeleteFolderAll");
    let directoryHandle = null;
    let savedDirectoryHandle = null;
    let pendingFolderDeletion = null;
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

    async function getDirectoryContents(handle) {
        const { notes: listedNotes, directories } = await NoteFiles.listDirectory(handle);
        let savedOrder = [];
        try { savedOrder = await NoteStorage.loadNoteOrder(handle); }
        catch { showStatus("Impossible de charger l’ordre enregistré des notes"); }
        const notesByName = new Map(listedNotes.map(note => [note.name, note]));
        const notes = savedOrder.map(name => notesByName.get(name)).filter(Boolean);
        const alreadyOrdered = new Set(notes.map(note => note.name));
        notes.push(...listedNotes.filter(note => !alreadyOrdered.has(note.name)));
        return { notes, folders: directories };
    }

    async function refreshNotes() {
        if (!directoryHandle) return;
        const { notes, folders } = await getDirectoryContents(directoryHandle);
        NoteHomeView.renderNotes({
            list: notesList,
            emptyState: notesEmpty,
            directoryStatus,
            createButton,
            createFolderButton,
            notes,
            folders,
            directoryHandle,
            directoryName: directoryHandle.name,
            onOpen: openNote,
            onLoadFolder: loadFolder,
            onCreateNote: createNote,
            onMoveNote: moveNote,
            onDelete: deleteNote,
            onDeleteFolder: requestFolderDeletion,
            onRename: renameFromList,
            onError: error => showStatus(error?.message || "Impossible de déplier ce dossier."),
            onReorder: async (order, ownerDirectory) => {
                try {
                    await NoteStorage.saveNoteOrder(ownerDirectory, order);
                    await refreshNotes();
                    showStatus("Ordre des notes enregistré");
                } catch {
                    showStatus("Impossible d’enregistrer l’ordre des notes");
                }
            }
        });
    }

    async function loadFolder(handle) {
        await requestDirectoryPermission(handle);
        return getDirectoryContents(handle);
    }

    async function moveNote(fileName, sourceDirectory, targetDirectory) {
        const moved = await NoteFiles.moveNote(sourceDirectory, fileName, targetDirectory);
        if (!moved.moved) return null;
        try {
            const sourceOrder = await NoteStorage.loadNoteOrder(sourceDirectory);
            const targetOrder = await NoteStorage.loadNoteOrder(targetDirectory);
            await NoteStorage.saveNoteOrder(sourceDirectory, sourceOrder.filter(name => name !== fileName));
            if (!targetOrder.includes(fileName)) targetOrder.push(fileName);
            await NoteStorage.saveNoteOrder(targetDirectory, targetOrder);
        } catch {
            showStatus("Note déplacée, mais son ordre n’a pas pu être enregistré.");
        }
        const note = await NoteFiles.readNote(moved.handle);
        return { ...note, title: NoteFiles.getTitle(note.content, note.name) };
    }

    async function deleteNote(fileName, ownerDirectory = directoryHandle) {
        if (!ownerDirectory || !window.confirm(`Supprimer définitivement « ${fileName} » ?`)) return;
        try {
            await NoteFiles.deleteNote(ownerDirectory, fileName);
            await refreshNotes();
            showStatus(`Note « ${fileName} » supprimée`);
        } catch (error) {
            showStatus(error?.name === "NotAllowedError"
                ? "Accès refusé. Réautorisez le dossier pour supprimer cette note."
                : error.message || "Impossible de supprimer cette note.");
        }
    }

    function requestFolderDeletion(folderName, parentDirectory) {
        pendingFolderDeletion = { folderName, parentDirectory };
        deleteFolderDialogTitle.textContent = `Supprimer « ${folderName} » ?`;
        deleteFolderDialogMessage.textContent = `Le dossier se trouve dans « ${parentDirectory.name} ». Tu peux supprimer tout son contenu, ou remonter ses fichiers et sous-dossiers dans le parent.`;
        deleteFolderDialogFeedback.textContent = "";
        deleteFolderDialogFeedback.hidden = true;
        deleteFolderDialog.showModal();
    }

    async function completeFolderDeletion(preserveContents) {
        if (!pendingFolderDeletion) return;
        const { folderName, parentDirectory } = pendingFolderDeletion;
        deleteFolderKeepButton.disabled = true;
        deleteFolderAllButton.disabled = true;
        deleteFolderDialogFeedback.textContent = "";
        deleteFolderDialogFeedback.hidden = true;
        try {
            await NoteFiles.deleteFolder(parentDirectory, folderName, preserveContents);
            deleteFolderDialog.close();
            pendingFolderDeletion = null;
            await refreshNotes();
            showStatus(preserveContents
                ? `Dossier « ${folderName} » supprimé; son contenu a été conservé dans le parent.`
                : `Dossier « ${folderName} » et son contenu supprimés.`);
        } catch (error) {
            deleteFolderDialogFeedback.textContent = error?.name === "NotAllowedError"
                ? "Accès refusé. Réautorise le dossier parent puis réessaie."
                : error.message || "Impossible de supprimer ce dossier.";
            deleteFolderDialogFeedback.hidden = false;
        } finally {
            deleteFolderKeepButton.disabled = false;
            deleteFolderAllButton.disabled = false;
        }
    }

    async function renameNoteFile(oldName, requestedName, ownerDirectory = directoryHandle) {
        const renamed = await NoteFiles.renameNote(ownerDirectory, oldName, requestedName);
        if (renamed.name !== oldName) {
            try {
                const order = await NoteStorage.loadNoteOrder(ownerDirectory);
                await NoteStorage.saveNoteOrder(ownerDirectory, order.map(name => name === oldName ? renamed.name : name));
            } catch { /* l'ordre sera simplement recalculé */ }
        }
        return renamed;
    }

    function renameErrorMessage(error) {
        return error?.name === "NotAllowedError"
            ? "Accès refusé. Réautorisez le dossier pour renommer cette note."
            : error.message || "Impossible de renommer cette note.";
    }

    async function renameFromList(fileName, ownerDirectory = directoryHandle) {
        if (!ownerDirectory) return;
        const requestedName = window.prompt("Nouveau nom de la note :", fileName.replace(/\.md$/i, ""));
        if (requestedName === null) return;
        try {
            await renameNoteFile(fileName, requestedName, ownerDirectory);
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

    async function downloadHtml() {
        await NoteEditorView.waitForRender();
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
        if (directoryHandle?.remote || NoteStorage.migrationHandled()) return;
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
        if (handle.remote) {
            savedDirectoryHandle = null;
            updateDirectoryButtons(true);
            chooseDirectoryButton.textContent = "Utiliser un dossier local";
            changeDirectoryButton.hidden = true;
        } else {
            await NoteStorage.saveDirectory(handle);
            NoteStorage.saveServer(null);
        }
        await refreshNotes();
        await migrateLegacyNote();
        await refreshNotes();
    }

    function requestServerToken() {
        const dialog = document.getElementById("serverTokenDialog");
        const form = document.getElementById("serverTokenForm");
        const input = document.getElementById("serverTokenInput");
        const remember = document.getElementById("rememberServerToken");
        input.value = "";
        remember.checked = true;
        return new Promise(resolve => {
            dialog.addEventListener("close", () => {
                resolve(dialog.returnValue === "connect" ? { token: input.value, remember: remember.checked } : null);
            }, { once: true });
            dialog.showModal();
            input.focus();
        });
    }

    async function connectServer(saved = null) {
        let url = saved?.url;
        let token = saved?.token || "";
        let rememberToken = Boolean(token);
        if (!url) {
            const fallback = /^https?:$/.test(location.protocol) ? location.origin : "http://";
            url = window.prompt("Adresse du serveur de notes (ex. http://192.168.1.20:3000) :", fallback)?.trim();
            if (!url) return;
        }
        try {
            let client;
            try { client = await RemoteBackend.connect({ baseUrl: url, token }); }
            catch (error) {
                if (error.name !== "NotAllowedError") throw error;
                const credentials = await requestServerToken();
                if (!credentials) throw error;
                token = credentials.token;
                rememberToken = credentials.remember;
                try { client = await RemoteBackend.connect({ baseUrl: url, token }); }
                catch (retryError) {
                    if (retryError.name === "NotAllowedError") NoteStorage.saveServer({ url, token: "" });
                    throw retryError;
                }
            }
            await connectDirectory(client.root, true);
            const saved = NoteStorage.saveServer({ url, token: rememberToken ? token : "" });
            showStatus(saved ? "Serveur connecté" : "Serveur connecté, mais le navigateur n’a pas pu mémoriser la connexion.");
        } catch (error) {
            directoryStatus.textContent = error.message || "Connexion au serveur impossible.";
            showStatus(error.message || "Connexion au serveur impossible.");
        }
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

    async function createNote(ownerDirectory = directoryHandle) {
        if (!ownerDirectory) return;
        const requestedName = window.prompt("Nom de la nouvelle note :");
        if (requestedName === null) return;
        try {
            const note = await NoteFiles.createNote(ownerDirectory, requestedName);
            await openNote(note.handle);
        } catch (error) {
            showStatus(error.message || "Impossible de créer cette note");
        }
    }

    async function createFolder() {
        if (!directoryHandle) return;
        const requestedName = window.prompt("Nom du nouveau dossier :");
        if (requestedName === null) return;
        try {
            const folder = await NoteFiles.createFolder(directoryHandle, requestedName);
            await refreshNotes();
            showStatus(`Dossier « ${folder.name} » créé`);
        } catch (error) {
            showStatus(error?.name === "NotAllowedError"
                ? "Accès refusé. Réautorisez le dossier pour créer un sous-dossier."
                : error.message || "Impossible de créer ce dossier.");
        }
    }

    NoteEditorInput.bind(editor, saveNow);
    NoteEditorView.bindTaskChanges(editor, preview, wordCount, scheduleAutoSave);
    NoteEditorView.bindHeadingCollapse(preview, editor);
    NotePreviewDnd.bind(preview, editor, () => {
        renderPreview();
        scheduleAutoSave();
    });
    editor.addEventListener("input", () => {
        renderPreview();
        scheduleAutoSave();
    });
    window.addEventListener("resize", () => {
        NoteEditorView.resizeEditor(editor);
        NoteEditorView.alignHeadings(editor, preview);
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
    chooseDirectoryButton.addEventListener("click", () => directoryHandle?.remote ? chooseAnotherDirectory() : chooseDirectory());
    connectServerButton.addEventListener("click", () => connectServer());
    changeDirectoryButton.addEventListener("click", chooseAnotherDirectory);
    createButton.addEventListener("click", () => createNote());
    createFolderButton.addEventListener("click", createFolder);
    deleteFolderKeepButton.addEventListener("click", () => completeFolderDeletion(true));
    deleteFolderAllButton.addEventListener("click", () => completeFolderDeletion(false));
    document.getElementById("btnCancelFolderDelete").addEventListener("click", () => deleteFolderDialog.close());
    deleteFolderDialog.addEventListener("close", () => { pendingFolderDeletion = null; });

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
        const savedServer = NoteStorage.loadServer();
        if (savedServer) {
            await connectServer(savedServer);
            if (directoryHandle) return;
        }
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