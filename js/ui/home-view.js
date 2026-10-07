(() => {
    let draggedNote = null;

    function renderNotes({ list, emptyState, directoryStatus, createButton, createFolderButton, notes, folders = [], directoryName, directoryHandle, onOpen, onLoadFolder, onCreateNote, onMoveNote, onDelete, onDeleteFolder, onRename, onReorder, onError }) {
        const rootStatus = () => `${notes.length} note${notes.length === 1 ? "" : "s"} et ${folders.length} dossier${folders.length === 1 ? "" : "s"} dans ${directoryName}`;
        const clearDragState = () => {
            document.querySelectorAll(".drag-target-active").forEach(element => element.classList.remove("drag-target-active"));
            directoryStatus.classList.remove("directory-drop-ready", "directory-drop-active");
            directoryStatus.textContent = rootStatus();
            draggedNote = null;
        };
        const removeDraggedNote = dragged => {
            const index = dragged.siblingNotes.findIndex(entry => entry.name === dragged.note.name);
            if (index >= 0) dragged.siblingNotes.splice(index, 1);
        };
        const refreshRootList = () => {
            list.replaceChildren();
            renderContents(list, rootContents, directoryHandle, 0);
            directoryStatus.textContent = rootStatus();
        };
        const renderNote = (note, container, siblingNotes, directoryHandle, depth) => {
            const item = document.createElement("li");
            const row = document.createElement("div");
            const grip = document.createElement("button");
            const openButton = document.createElement("button");
            const title = document.createElement("span");
            const fileName = document.createElement("span");
            const renameButton = document.createElement("button");
            const deleteButton = document.createElement("button");
            row.className = "note-row";
            item.dataset.noteName = note.name;
            item.style.setProperty("--folder-depth", String(depth));
            grip.type = "button";
            grip.className = "note-drag-handle";
            grip.draggable = true;
            grip.setAttribute("aria-label", `Déplacer ${note.name}`);
            grip.title = "Glisser pour déplacer; utiliser les flèches haut et bas au clavier";
            grip.setAttribute("aria-keyshortcuts", "ArrowUp ArrowDown");
            const gripIcon = document.createElement("span");
            gripIcon.className = "drag-grip-icon";
            gripIcon.setAttribute("aria-hidden", "true");
            grip.append(gripIcon);
            openButton.type = "button";
            openButton.className = "note-link";
            title.className = "note-title";
            fileName.className = "note-filename";
            title.textContent = note.title;
            fileName.textContent = note.name;
            openButton.append(title, fileName);
            openButton.addEventListener("click", () => onOpen(note.handle));
            grip.addEventListener("dragstart", event => {
                draggedNote = { note, siblingNotes, directoryHandle };
                item.classList.add("is-dragging");
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", note.name);
                if (directoryHandle !== rootDirectoryHandle) {
                    directoryStatus.classList.add("directory-drop-ready");
                    directoryStatus.textContent = `Déposer ici pour sortir la note de son dossier : ${directoryName}`;
                }
            });
            grip.addEventListener("dragend", clearDragState);
            grip.addEventListener("keydown", event => {
                if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                event.preventDefault();
                const currentIndex = siblingNotes.findIndex(entry => entry.name === note.name);
                const targetIndex = event.key === "ArrowUp" ? currentIndex - 1 : currentIndex + 1;
                if (targetIndex < 0 || targetIndex >= siblingNotes.length) return;
                const reordered = [...siblingNotes];
                const [moved] = reordered.splice(currentIndex, 1);
                reordered.splice(targetIndex, 0, moved);
                onReorder(reordered.map(entry => entry.name), directoryHandle);
            });
            item.addEventListener("dragover", event => {
                if (!container.querySelector(":scope > .is-dragging")) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                const midpoint = item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2;
                item.classList.toggle("drag-over-before", event.clientY < midpoint);
                item.classList.toggle("drag-over-after", event.clientY >= midpoint);
            });
            item.addEventListener("dragleave", event => {
                if (!item.contains(event.relatedTarget)) item.classList.remove("drag-over-before", "drag-over-after");
            });
            item.addEventListener("drop", event => {
                event.preventDefault();
                const sourceName = event.dataTransfer.getData("text/plain");
                const sourceIndex = siblingNotes.findIndex(entry => entry.name === sourceName);
                const targetIndex = siblingNotes.findIndex(entry => entry.name === note.name);
                if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
                const reordered = [...siblingNotes];
                const [moved] = reordered.splice(sourceIndex, 1);
                const midpoint = item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2;
                let insertionIndex = targetIndex + (event.clientY >= midpoint ? 1 : 0);
                if (sourceIndex < insertionIndex) insertionIndex -= 1;
                reordered.splice(insertionIndex, 0, moved);
                onReorder(reordered.map(entry => entry.name), directoryHandle);
            });
            renameButton.type = "button";
            renameButton.className = "note-rename";
            renameButton.setAttribute("aria-label", `Renommer ${note.name}`);
            renameButton.title = `Renommer ${note.name}`;
            renameButton.textContent = "✏️";
            renameButton.addEventListener("click", () => onRename?.(note.name, directoryHandle));
            deleteButton.type = "button";
            deleteButton.className = "note-delete";
            deleteButton.setAttribute("aria-label", `Supprimer ${note.name}`);
            deleteButton.title = `Supprimer ${note.name}`;
            deleteButton.textContent = "🗑";
            deleteButton.addEventListener("click", () => onDelete(note.name, directoryHandle));
            row.append(grip, openButton, renameButton, deleteButton);
            item.append(row);
            container.append(item);
        };

        const renderContents = (container, contents, directoryHandle, depth) => {
            for (const folder of contents.folders) {
                const item = document.createElement("li");
                const row = document.createElement("div");
                const toggle = document.createElement("button");
                const icon = document.createElement("span");
                const name = document.createElement("span");
                const kind = document.createElement("span");
                const createNoteButton = document.createElement("button");
                const deleteFolderButton = document.createElement("button");
                const children = document.createElement("ul");
                const expanded = Boolean(folder.contents);
                item.className = "folder-item";
                item.style.setProperty("--folder-depth", String(depth));
                row.className = "folder-row";
                toggle.type = "button";
                toggle.className = "folder-link";
                toggle.setAttribute("aria-label", `${expanded ? "Replier" : "Déplier"} le dossier ${folder.name}`);
                toggle.setAttribute("aria-expanded", String(expanded));
                icon.className = "folder-icon";
                icon.setAttribute("aria-hidden", "true");
                icon.textContent = expanded ? "📂" : "📁";
                name.className = "folder-name";
                name.textContent = folder.name;
                kind.className = "folder-kind";
                kind.textContent = "Dossier";
                toggle.append(icon, name, kind);
                toggle.addEventListener("click", async () => {
                    if (folder.contents) {
                        folder.contents = null;
                        container.replaceChildren();
                        renderContents(container, contents, directoryHandle, depth);
                        return;
                    }
                    toggle.disabled = true;
                    try {
                        folder.contents = await onLoadFolder(folder.handle);
                        container.replaceChildren();
                        renderContents(container, contents, directoryHandle, depth);
                    } catch (error) {
                        onError?.(error);
                        toggle.disabled = false;
                    }
                });
                createNoteButton.type = "button";
                createNoteButton.className = "folder-create-note";
                createNoteButton.setAttribute("aria-label", `Créer une note dans ${folder.name}`);
                createNoteButton.title = `Créer une note dans ${folder.name}`;
                createNoteButton.textContent = "+";
                createNoteButton.addEventListener("click", () => onCreateNote(folder.handle));
                deleteFolderButton.type = "button";
                deleteFolderButton.className = "folder-delete";
                deleteFolderButton.setAttribute("aria-label", `Supprimer le dossier ${folder.name}`);
                deleteFolderButton.title = `Supprimer le dossier ${folder.name}`;
                deleteFolderButton.textContent = "🗑";
                deleteFolderButton.addEventListener("click", () => onDeleteFolder?.(folder.name, directoryHandle));
                row.append(toggle, createNoteButton, deleteFolderButton);
                children.className = "folder-children";
                children.hidden = !expanded;
                if (expanded) renderContents(children, folder.contents, folder.handle, depth + 1);
                item.append(row, children);
                item.addEventListener("dragover", event => {
                    if (!draggedNote) return;
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                    item.classList.add("drag-target-active");
                });
                item.addEventListener("dragleave", event => {
                    if (!item.contains(event.relatedTarget)) item.classList.remove("drag-target-active");
                });
                item.addEventListener("drop", async event => {
                    if (!draggedNote) return;
                    event.preventDefault();
                    event.stopPropagation();
                    item.classList.remove("drag-target-active");
                    const dragged = draggedNote;
                    try {
                        const targetContents = folder.contents || await onLoadFolder(folder.handle);
                        const moved = await onMoveNote(dragged.note.name, dragged.directoryHandle, folder.handle);
                        if (!moved) return;
                        removeDraggedNote(dragged);
                        targetContents.notes = targetContents.notes.filter(entry => entry.name !== moved.name);
                        targetContents.notes.push(moved);
                        targetContents.notes.sort((left, right) => left.name.localeCompare(right.name, "fr", { sensitivity: "base" }));
                        folder.contents = targetContents;
                        container.replaceChildren();
                        renderContents(container, contents, directoryHandle, depth);
                    } catch (error) {
                        onError?.(error);
                    } finally {
                        clearDragState();
                    }
                });
                container.append(item);
            }
            for (const note of contents.notes) renderNote(note, container, contents.notes, directoryHandle, depth);
        };

        list.replaceChildren();
        const rootContents = { folders, notes };
        const rootDirectoryHandle = directoryHandle;
        emptyState.hidden = notes.length > 0 || folders.length > 0;
        renderContents(list, rootContents, directoryHandle, 0);
        directoryStatus.textContent = rootStatus();
        directoryStatus.ondragover = event => {
            if (!draggedNote) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            directoryStatus.classList.add("directory-drop-active");
        };
        directoryStatus.ondragleave = event => {
            if (!directoryStatus.contains(event.relatedTarget)) directoryStatus.classList.remove("directory-drop-active");
        };
        directoryStatus.ondrop = async event => {
            if (!draggedNote) return;
            event.preventDefault();
            const dragged = draggedNote;
            try {
                const moved = await onMoveNote(dragged.note.name, dragged.directoryHandle, rootDirectoryHandle);
                if (!moved) return;
                removeDraggedNote(dragged);
                notes.push(moved);
                notes.sort((left, right) => left.name.localeCompare(right.name, "fr", { sensitivity: "base" }));
                refreshRootList();
            } catch (error) {
                onError?.(error);
            } finally {
                clearDragState();
            }
        };
        createButton.disabled = false;
        if (createFolderButton) createFolderButton.disabled = false;
    }

    window.NoteHomeView = { renderNotes };
})();