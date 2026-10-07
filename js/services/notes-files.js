(() => {
    function download(fileName, content, mimeType) {
        const blobUrl = URL.createObjectURL(new Blob([content], { type: mimeType }));
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = fileName;
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
    }

    function getTitle(content, fileName) {
        const heading = content.match(/^#\s+(.+)$/m)?.[1].trim();
        return heading || fileName.replace(/\.md$/i, "") || "Note sans titre";
    }

    async function listNotes(directoryHandle) {
        const notes = [];
        for await (const entry of directoryHandle.values()) {
            if (entry.kind !== "file" || !/\.md$/i.test(entry.name)) continue;
            const file = await entry.getFile();
            notes.push({ name: entry.name, title: getTitle(await file.text(), entry.name), handle: entry, modified: file.lastModified });
        }
        return notes.sort((left, right) => left.name.localeCompare(right.name, "fr", { sensitivity: "base" }));
    }

    async function readNote(fileHandle) {
        const file = await fileHandle.getFile();
        return { name: file.name, content: await file.text(), handle: fileHandle };
    }

    async function toFileName(directoryHandle, requestedName, currentName) {
        const baseName = requestedName.trim().replace(/\.md$/i, "");
        if (!baseName || /[<>:"/\\|?*\u0000-\u001f]/.test(baseName) || /[. ]$/.test(baseName)) {
            throw new Error("Choisissez un nom de fichier valide.");
        }
        const fileName = `${baseName}.md`;
        for await (const entry of directoryHandle.values()) {
            if (entry.kind === "file" && entry.name !== currentName && entry.name.toLocaleLowerCase("fr") === fileName.toLocaleLowerCase("fr")) {
                throw new Error("Une note porte déjà ce nom.");
            }
        }
        return fileName;
    }

    async function moveFile(directoryHandle, oldName, newName) {
        const oldHandle = await directoryHandle.getFileHandle(oldName);
        const content = await (await oldHandle.getFile()).text();
        const handle = await directoryHandle.getFileHandle(newName, { create: true });
        await writeNote(handle, content);
        await directoryHandle.removeEntry(oldName);
        return handle;
    }

    async function renameNote(directoryHandle, oldName, requestedName) {
        const fileName = await toFileName(directoryHandle, requestedName, oldName);
        if (fileName === oldName) return { name: oldName, handle: await directoryHandle.getFileHandle(oldName) };
        // Un changement de casse seul vise le même fichier sur un système insensible à la casse.
        if (fileName.toLocaleLowerCase("fr") === oldName.toLocaleLowerCase("fr")) {
            await moveFile(directoryHandle, oldName, `${fileName}.renaming.tmp.md`);
            return { name: fileName, handle: await moveFile(directoryHandle, `${fileName}.renaming.tmp.md`, fileName) };
        }
        return { name: fileName, handle: await moveFile(directoryHandle, oldName, fileName) };
    }

    async function createNote(directoryHandle, requestedName) {
        const fileName = await toFileName(directoryHandle, requestedName);
        const handle = await directoryHandle.getFileHandle(fileName, { create: true });
        await writeNote(handle, "");
        return { name: fileName, content: "", handle };
    }

    async function writeNote(fileHandle, content) {
        const writable = await fileHandle.createWritable();
        try {
            await writable.write(content);
            await writable.close();
        } catch (error) {
            await writable.abort?.();
            throw error;
        }
    }

    async function deleteNote(directoryHandle, fileName) {
        if (!/\.md$/i.test(fileName) || fileName !== fileName.split(/[\\/]/).pop()) {
            throw new Error("Seuls les fichiers Markdown de ce dossier peuvent être supprimés.");
        }
        await directoryHandle.removeEntry(fileName);
    }

    window.NoteFiles = { createNote, deleteNote, download, getTitle, listNotes, readNote, renameNote, writeNote };
})();