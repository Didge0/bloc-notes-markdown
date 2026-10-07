(() => {
    const markerPattern = /^\s*(?:[-*+]\s+\[([ xX])\]\s+|[-*+]\s+|\d+[.)]\s*)/;
    const maxHeadingLevel = 3;

    function listKind(line) {
        if (/^\s*[-*+]\s+\[[ xX]\]\s+/.test(line)) return "task";
        if (/^\s*\d+[.)](?:\s|$)/.test(line)) return "ordered";
        return "bullet";
    }

    // Réécrit le marqueur de la première ligne selon le type de liste cible.
    function convertMarker(line, targetLine) {
        const kind = listKind(targetLine);
        const match = line.match(markerPattern);
        const text = match ? line.slice(match[0].length) : line.trim();
        const marker = kind === "task" ? `- [${match?.[1]?.toLowerCase() === "x" ? "x" : " "}] `
            : kind === "ordered" ? "1. " : "- ";
        return targetLine.match(/^\s*/)[0] + marker + text;
    }

    // target.position : "before", "after" ou "into" (juste sous un titre).
    function moveListItem(text, source, target) {
        const lines = text.split("\n");
        let index = target.position === "before" ? target.line
            : target.position === "after" ? target.endLine + 1
                : target.line + 1;
        if (index >= source.start && index <= source.end + 1) return null;
        const block = lines.slice(source.start, source.end + 1);
        block[0] = convertMarker(block[0], target.position === "into" ? "- " : lines[target.line]);
        lines.splice(source.start, block.length);
        if (index > source.end) index -= block.length;
        lines.splice(index, 0, ...block);
        return { text: lines.join("\n"), line: index };
    }

    function shiftHeadings(block, delta) {
        let inCode = false;
        return block.map(line => {
            if (/^\s*```/.test(line)) { inCode = !inCode; return line; }
            const heading = inCode ? null : line.match(/^(#{1,3})(\s+.+)$/);
            if (!heading) return line;
            return "#".repeat(Math.min(maxHeadingLevel, Math.max(1, heading[1].length + delta))) + heading[2];
        });
    }

    // La section déplacée prend le niveau de la section cible (même niveau, "before" ou "after").
    function moveSection(text, source, target) {
        if (target.line >= source.start && target.line <= source.end) return null;
        const lines = text.split("\n");
        let index = target.position === "before" ? target.line : target.endLine + 1;
        const removedLength = source.end - source.start + 1;
        const block = shiftHeadings(lines.slice(source.start, source.end + 1), target.level - source.level);
        while (block.length > 1 && !block[block.length - 1].trim()) block.pop();
        lines.splice(source.start, removedLength);
        if (index > source.end) index -= removedLength;
        let line = index;
        if (index >= lines.length) {
            if (lines.length && lines[lines.length - 1].trim()) { block.unshift(""); line += 1; }
        } else block.push("");
        lines.splice(index, 0, ...block);
        return { text: lines.join("\n"), line };
    }

    function bind(preview, editor, onMoved) {
        let drag = null;
        let viaKeyboard = false;
        const undoStack = [];
        const redoStack = [];

        const clearMarks = () => preview.querySelectorAll(".drag-over-before, .drag-over-after, .drag-over-into")
            .forEach(element => element.classList.remove("drag-over-before", "drag-over-after", "drag-over-into"));
        const clearAll = () => {
            clearMarks();
            preview.querySelectorAll(".is-dragging").forEach(element => element.classList.remove("is-dragging"));
        };

        function sourceFrom(handle) {
            const item = handle.closest("li[data-line]");
            if (item) return { kind: "item", element: item, start: Number(item.dataset.line), end: Number(item.dataset.endLine) };
            const section = handle.closest(".markdown-section[data-line]");
            if (!section) return null;
            return { kind: "section", element: section, start: Number(section.dataset.line), end: Number(section.dataset.endLine), level: Number(section.dataset.level) };
        }

        function resolveTarget(event) {
            if (!drag || !(event.target instanceof Element)) return null;
            const item = drag.kind === "item" ? event.target.closest("li[data-line]") : null;
            if (item && preview.contains(item)) {
                if (item === drag.element) return null;
                const rect = item.getBoundingClientRect();
                return { data: item, mark: item, position: event.clientY < rect.top + rect.height / 2 ? "before" : "after" };
            }
            const row = event.target.closest(".markdown-section-heading");
            const section = row?.parentElement;
            if (!section || !preview.contains(section)) return null;
            if (drag.kind === "item") return { data: section, mark: row, position: "into" };
            if (drag.element.contains(section)) return null;
            const rect = row.getBoundingClientRect();
            return { data: section, mark: section, position: event.clientY < rect.top + rect.height / 2 ? "before" : "after" };
        }

        function apply(source, target) {
            const destination = {
                line: Number(target.data.dataset.line),
                endLine: Number(target.data.dataset.endLine),
                level: Number(target.data.dataset.level),
                position: target.position
            };
            const result = source.kind === "item"
                ? moveListItem(editor.value, source, destination)
                : moveSection(editor.value, source, destination);
            if (!result) return;
            undoStack.push({ before: editor.value, after: result.text });
            redoStack.length = 0;
            editor.value = result.text;
            onMoved();
            if (!viaKeyboard) return;
            const selector = source.kind === "item"
                ? `li[data-line="${result.line}"] > .drag-handle`
                : `.markdown-section[data-line="${result.line}"] > .markdown-section-heading > .drag-handle`;
            preview.querySelector(selector)?.focus();
        }

        preview.addEventListener("dragstart", event => {
            const handle = event.target instanceof Element ? event.target.closest(".drag-handle") : null;
            if (!handle || !preview.contains(handle)) return;
            drag = sourceFrom(handle);
            if (!drag) return;
            drag.element.classList.add("is-dragging");
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", "");
            event.dataTransfer.setDragImage(drag.element.querySelector(":scope > .markdown-section-heading") || drag.element, 0, 0);
        });
        preview.addEventListener("dragover", event => {
            const target = resolveTarget(event);
            clearMarks();
            if (!target) return;
            event.preventDefault();
            event.dataTransfer.dropEffect = "move";
            target.mark.classList.add(`drag-over-${target.position}`);
        });
        preview.addEventListener("dragleave", event => {
            if (!preview.contains(event.relatedTarget)) clearMarks();
        });
        preview.addEventListener("drop", event => {
            const target = resolveTarget(event);
            if (!target) return;
            event.preventDefault();
            const source = drag;
            clearAll();
            viaKeyboard = false;
            apply(source, target);
        });
        preview.addEventListener("dragend", () => {
            drag = null;
            clearAll();
        });
        preview.addEventListener("keydown", event => {
            const handle = event.target instanceof Element ? event.target.closest(".drag-handle") : null;
            if (!handle || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
            event.preventDefault();
            const source = sourceFrom(handle);
            if (!source) return;
            const up = event.key === "ArrowUp";
            const sibling = up ? source.element.previousElementSibling : source.element.nextElementSibling;
            const expected = source.kind === "item" ? "LI" : "DIV";
            if (!sibling || sibling.tagName !== expected || !sibling.dataset.line || (source.kind === "section" && !sibling.classList.contains("markdown-section"))) return;
            drag = source;
            viaKeyboard = true;
            apply(source, { data: sibling, position: up ? "before" : "after" });
            drag = null;
        });

        // Une entrée ne s'applique que si le texte n'a pas changé depuis; sinon l'annulation native de l'éditeur reprend la main.
        document.addEventListener("keydown", event => {
            if (!(event.ctrlKey || event.metaKey) || event.altKey || preview.offsetParent === null) return;
            const key = event.key.toLowerCase();
            const undo = key === "z" && !event.shiftKey;
            if (!undo && key !== "y" && !(key === "z" && event.shiftKey)) return;
            const field = event.target;
            if ((field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) && field !== editor) return;
            const stack = undo ? undoStack : redoStack;
            const entry = stack[stack.length - 1];
            if (!entry || editor.value !== (undo ? entry.after : entry.before)) return;
            event.preventDefault();
            stack.pop();
            (undo ? redoStack : undoStack).push(entry);
            editor.value = undo ? entry.before : entry.after;
            onMoved();
        });
    }

    window.NotePreviewDnd = { bind, moveListItem, moveSection };
})();
