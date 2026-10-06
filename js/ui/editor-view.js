(() => {
    function renderMarkdown(editor, preview, wordCount) {
        const ast = MarkdownParser.parse(editor.value);
        preview.replaceChildren(MarkdownRenderer.render(ast));
        const words = editor.value.trim().split(/\s+/u).filter(Boolean).length;
        wordCount.textContent = `Mots : ${words}`;
    }

    function bindTaskChanges(editor, preview, wordCount, onChange) {
        preview.addEventListener("change", event => {
            const checkbox = event.target.closest("input[type='checkbox'][data-task-line]");
            if (!checkbox || !preview.contains(checkbox)) return;
            const lines = editor.value.split("\n");
            const lineIndex = Number(checkbox.dataset.taskLine);
            const taskLine = lines[lineIndex];
            const marker = taskLine?.match(/^(\s*[-*+]\s+\[)([ xX])(\]\s+.*)$/);
            if (!marker) return;
            lines[lineIndex] = `${marker[1]}${checkbox.checked ? "x" : " "}${marker[3]}`;
            editor.value = lines.join("\n");
            renderMarkdown(editor, preview, wordCount);
            onChange();
        });
    }

    function bindHeadingCollapse(preview) {
        preview.addEventListener("click", event => {
            const toggle = event.target.closest(".markdown-collapse-toggle");
            if (!toggle || !preview.contains(toggle)) return;
            const section = toggle.closest(".markdown-section");
            const content = section?.querySelector(":scope > .markdown-section-content");
            if (!content) return;

            const expanded = toggle.getAttribute("aria-expanded") === "true";
            content.hidden = expanded;
            toggle.setAttribute("aria-expanded", String(!expanded));
            toggle.setAttribute("aria-label", `${expanded ? "Déplier" : "Replier"} le contenu de cette section`);
            toggle.title = expanded ? "Déplier le contenu" : "Replier le contenu";
        });
    }

    function showEditor({ home, editorView, header, editor, previewToggle }) {
        home.hidden = true;
        editorView.hidden = false;
        header.hidden = false;
        editorView.classList.remove("preview-only");
        previewToggle.setAttribute("aria-pressed", "false");
        previewToggle.title = "Afficher l’aperçu seul";
        previewToggle.querySelector("[aria-hidden='true']").textContent = "👁";
        previewToggle.querySelector(".preview-toggle-label").textContent = "Aperçu seul";
        editor.focus();
    }

    function togglePreviewOnly(editorView, button, editor) {
        const previewOnly = editorView.classList.toggle("preview-only");
        button.setAttribute("aria-pressed", String(previewOnly));
        button.title = previewOnly ? "Revenir au mode édition" : "Afficher l’aperçu seul";
        button.querySelector("[aria-hidden='true']").textContent = previewOnly ? "✎" : "👁";
        button.querySelector(".preview-toggle-label").textContent = previewOnly ? "Mode édition" : "Aperçu seul";
        if (!previewOnly) editor.focus();
    }

    window.NoteEditorView = { bindHeadingCollapse, bindTaskChanges, renderMarkdown, showEditor, togglePreviewOnly };
})();