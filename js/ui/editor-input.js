(() => {
    function notifyChange(editor) {
        editor.dispatchEvent(new Event("input", { bubbles: true }));
    }

    function lineBounds(value, caret) {
        const start = value.lastIndexOf("\n", caret - 1) + 1;
        const breakAt = value.indexOf("\n", caret);
        return { start, end: breakAt === -1 ? value.length : breakAt };
    }

    function handleEnter(event, editor) {
        if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
        if (editor.selectionStart !== editor.selectionEnd) return;
        const value = editor.value;
        const caret = editor.selectionStart;
        const { start, end } = lineBounds(value, caret);
        if (caret !== end) return;
        const line = value.slice(start, end);
        if (/^(?:\s*[-*+]\s+\[[ xX]\]\s*|\s*[-*+]\s*|\s*\d+[.)]\s*)$/.test(line)) {
            event.preventDefault();
            editor.setRangeText("", start, end, "end");
            notifyChange(editor);
            return;
        }
        const task = line.match(/^(\s*[-*+]\s+)\[[ xX]\]\s+.*$/);
        const ordered = line.match(/^(\s*)(\d+)([.)])\s+.*$/);
        const bullet = line.match(/^(\s*[-*+]\s+).*$/);
        const continuation = task ? `${task[1]}[ ] ` : ordered ? `${ordered[1]}${Number(ordered[2]) + 1}${ordered[3]} ` : bullet?.[1];
        if (!continuation) return;
        event.preventDefault();
        editor.setRangeText(`\n${continuation}`, caret, caret, "end");
        notifyChange(editor);
    }

    function handleBackspace(event, editor) {
        if (event.key !== "Backspace" || editor.selectionStart !== editor.selectionEnd) return;
        const caret = editor.selectionStart;
        const { start, end } = lineBounds(editor.value, caret);
        if (caret !== end || !/^(?:\s*[-*+]\s+\[[ xX]\]\s*|\s*[-*+]\s*|\s*\d+[.)]\s*)$/.test(editor.value.slice(start, end))) return;
        event.preventDefault();
        editor.setRangeText("", start, end, "end");
        notifyChange(editor);
    }

    function handleTab(event, editor) {
        if (event.key !== "Tab") return;
        event.preventDefault();
        const value = editor.value;
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        if (start === end) {
            if (!event.shiftKey) editor.setRangeText("    ", start, end, "end");
            else {
                const lineStart = value.lastIndexOf("\n", start - 1) + 1;
                const indent = value.slice(lineStart).match(/^(?:\t| {1,4})/)?.[0];
                if (indent) editor.setRangeText("", lineStart, lineStart + indent.length, "preserve");
            }
        } else {
            const firstLine = value.lastIndexOf("\n", start - 1) + 1;
            const lastPosition = end > start && value[end - 1] === "\n" ? end - 1 : Math.max(start, end - 1);
            const lastLine = value.lastIndexOf("\n", lastPosition - 1) + 1;
            const breakAt = value.indexOf("\n", lastLine);
            const segmentEnd = breakAt === -1 ? value.length : breakAt;
            const lines = value.slice(firstLine, segmentEnd).split("\n").map(line =>
                event.shiftKey ? line.replace(/^(?:\t| {1,4})/, "") : `    ${line}`);
            editor.setRangeText(lines.join("\n"), firstLine, segmentEnd, "select");
        }
        notifyChange(editor);
    }

    function bind(editor) {
        editor.addEventListener("keydown", event => handleEnter(event, editor));
        editor.addEventListener("keydown", event => handleBackspace(event, editor));
        editor.addEventListener("keydown", event => handleTab(event, editor));
    }

    window.NoteEditorInput = { bind };
})();