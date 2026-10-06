(() => {
    function renderNotes({ list, emptyState, directoryStatus, createButton, notes, directoryName, onOpen, onDelete }) {
        list.replaceChildren();
        emptyState.hidden = notes.length > 0;
        for (const note of notes) {
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
            title.textContent = note.title;
            fileName.textContent = note.name;
            openButton.append(title, fileName);
            openButton.addEventListener("click", () => onOpen(note.handle));
            deleteButton.type = "button";
            deleteButton.className = "note-delete";
            deleteButton.setAttribute("aria-label", `Supprimer ${note.name}`);
            deleteButton.title = `Supprimer ${note.name}`;
            deleteButton.textContent = "🗑";
            deleteButton.addEventListener("click", () => onDelete(note.name));
            row.append(openButton, deleteButton);
            item.append(row);
            list.append(item);
        }
        directoryStatus.textContent = `${notes.length} note${notes.length === 1 ? "" : "s"} dans ${directoryName}`;
        createButton.disabled = false;
    }

    window.NoteHomeView = { renderNotes };
})();