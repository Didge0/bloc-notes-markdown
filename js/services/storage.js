(() => {
    const storageKey = "blocNotes";
    const databaseName = "bloc-notes-markdown";
    const directoryKey = "notes-directory";
    const noteOrderKey = "notes-order";

    function openDatabase() {
        return new Promise((resolve, reject) => {
            if (!window.indexedDB) {
                reject(new Error("Le stockage du dossier n’est pas disponible dans ce navigateur."));
                return;
            }
            const request = indexedDB.open(databaseName, 1);
            request.onupgradeneeded = () => request.result.createObjectStore("handles");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }

    async function storeHandle(mode, handle) {
        const database = await openDatabase();
        return new Promise((resolve, reject) => {
            const transaction = database.transaction("handles", mode);
            const store = transaction.objectStore("handles");
            let result = handle;
            if (mode === "readwrite") store.put(handle, directoryKey);
            else {
                const request = store.get(directoryKey);
                request.onsuccess = () => { result = request.result || null; };
            }
            transaction.oncomplete = () => resolve(result);
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error || new Error("Le stockage du dossier a été annulé."));
        }).finally(() => database.close());
    }

    async function storeNoteOrder(mode, directoryHandle, order) {
        const database = await openDatabase();
        const record = await new Promise((resolve, reject) => {
            const transaction = database.transaction("handles", mode);
            const store = transaction.objectStore("handles");
            let result = null;
            if (mode === "readwrite") {
                store.put({ directoryHandle, names: order }, noteOrderKey);
            }
            else {
                const request = store.get(noteOrderKey);
                request.onsuccess = () => { result = request.result || null; };
            }
            transaction.oncomplete = () => resolve(result);
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error || new Error("Le stockage de l’ordre a été annulé."));
        }).finally(() => database.close());
        if (mode === "readwrite") return true;
        if (!record?.directoryHandle || typeof record.directoryHandle.isSameEntry !== "function") return [];
        return await directoryHandle.isSameEntry(record.directoryHandle) && Array.isArray(record.names) ? record.names : [];
    }

    function load() {
        try {
            const value = localStorage.getItem(storageKey);
            if (!value) return null;
            const parsed = JSON.parse(value);
            if (!parsed || typeof parsed !== "object") return null;
            return {
                content: typeof parsed.content === "string" ? parsed.content : "",
                fileName: typeof parsed.fileName === "string" ? parsed.fileName : "Ma note"
            };
        } catch { return null; }
    }

    function migrationHandled() {
        try { return localStorage.getItem("blocNotesMigrationHandled") === "true"; }
        catch { return true; }
    }

    function markMigrationHandled() {
        try { localStorage.setItem("blocNotesMigrationHandled", "true"); }
        catch { return false; }
        return true;
    }

    window.NoteStorage = {
        load,
        loadDirectory: () => storeHandle("readonly"),
        loadNoteOrder: directoryHandle => storeNoteOrder("readonly", directoryHandle),
        migrationHandled,
        markMigrationHandled,
        save: note => {
            try { localStorage.setItem(storageKey, JSON.stringify(note)); return true; }
            catch { return false; }
        },
        saveNoteOrder: (directoryHandle, order) => storeNoteOrder("readwrite", directoryHandle, order),
        saveDirectory: handle => storeHandle("readwrite", handle)
    };
})();