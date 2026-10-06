(() => {
    function renderNotes({ list, emptyState, directoryStatus, createButton, notes, directoryName, onOpen, onDelete, onReorder }) {
        list.replaceChildren();
        emptyState.hidden = notes.length > 0;
        for (const note of notes) {
            const item = document.createElement("li");
            const row = document.createElement("div");
            const grip = document.createElement("button");
            const openButton = document.createElement("button");
            const title = document.createElement("span");
            const fileName = document.createElement("span");
            const deleteButton = document.createElement("button");
            row.className = "note-row";
            item.dataset.noteName = note.name;
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
                item.classList.add("is-dragging");
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", note.name);
            });
            grip.addEventListener("dragend", () => {
                list.querySelectorAll(".is-dragging, .drag-over-before, .drag-over-after").forEach(element => {
                    element.classList.remove("is-dragging", "drag-over-before", "drag-over-after");
                });
            });
            grip.addEventListener("keydown", event => {
                if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
                event.preventDefault();
                const currentIndex = notes.findIndex(entry => entry.name === note.name);
                const targetIndex = event.key === "ArrowUp" ? currentIndex - 1 : currentIndex + 1;
                if (targetIndex < 0 || targetIndex >= notes.length) return;
                const reordered = [...notes];
                const [moved] = reordered.splice(currentIndex, 1);
                reordered.splice(targetIndex, 0, moved);
                onReorder(reordered.map(entry => entry.name));
            });
            item.addEventListener("dragover", event => {
                if (!list.querySelector(".is-dragging")) return;
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                item.classList.toggle("drag-over-before", event.clientY < item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2);
                item.classList.toggle("drag-over-after", event.clientY >= item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2);
            });
            item.addEventListener("dragleave", event => {
                if (!item.contains(event.relatedTarget)) item.classList.remove("drag-over-before", "drag-over-after");
            });
            item.addEventListener("drop", event => {
                event.preventDefault();
                const sourceName = event.dataTransfer.getData("text/plain");
                const sourceIndex = notes.findIndex(entry => entry.name === sourceName);
                const targetIndex = notes.findIndex(entry => entry.name === note.name);
                if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
                const reordered = [...notes];
                const [moved] = reordered.splice(sourceIndex, 1);
                const targetPosition = item.getBoundingClientRect().top + item.getBoundingClientRect().height / 2;
                let insertionIndex = targetIndex + (event.clientY >= targetPosition ? 1 : 0);
                if (sourceIndex < insertionIndex) insertionIndex -= 1;
                reordered.splice(insertionIndex, 0, moved);
                onReorder(reordered.map(entry => entry.name));
            });
            deleteButton.type = "button";
            deleteButton.className = "note-delete";
            deleteButton.setAttribute("aria-label", `Supprimer ${note.name}`);
            deleteButton.title = `Supprimer ${note.name}`;
            deleteButton.textContent = "🗑";
            deleteButton.addEventListener("click", () => onDelete(note.name));
            row.append(grip, openButton, deleteButton);
            item.append(row);
            list.append(item);
        }
        directoryStatus.textContent = `${notes.length} note${notes.length === 1 ? "" : "s"} dans ${directoryName}`;
        createButton.disabled = false;
    }

    window.NoteHomeView = { renderNotes };
})();