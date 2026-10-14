(() => {
    let pendingDiagramRender = Promise.resolve();

    function resizeEditor(editor) {
        if (!editor.getClientRects().length) return;
        editor.style.height = "0px";
        editor.style.height = `${editor.scrollHeight}px`;
    }

    function renderMarkdown(editor, preview, wordCount) {
        resizeEditor(editor);
        const ast = MarkdownParser.parse(editor.value);
        preview.replaceChildren(MarkdownRenderer.render(ast));
        pendingDiagramRender = window.NoteMermaidRenderer?.render(preview) || Promise.resolve();
        const words = editor.value.trim().split(/\s+/u).filter(Boolean).length;
        wordCount.textContent = `Mots : ${words}`;
        return pendingDiagramRender;
    }

    async function waitForRender() {
        let render;
        do {
            render = pendingDiagramRender;
            await render;
            await window.NoteMermaidRenderer?.waitForRender();
        } while (render !== pendingDiagramRender);
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
            const link = event.target.closest("a[href^='#']");
            if (link && preview.contains(link)) {
                let targetId;
                try { targetId = decodeURIComponent(link.getAttribute("href").slice(1)); }
                catch { return; }
                const heading = [...preview.querySelectorAll("h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]")].find(item => item.id === targetId);
                if (!heading) return;
                event.preventDefault();
                for (let section = heading.closest(".markdown-section"); section && preview.contains(section); section = section.parentElement.closest(".markdown-section")) {
                    const content = section.querySelector(":scope > .markdown-section-content");
                    if (!content?.hidden) continue;
                    content.hidden = false;
                    const toggle = section.querySelector(":scope > .markdown-section-heading > .markdown-collapse-toggle");
                    toggle?.setAttribute("aria-expanded", "true");
                    toggle?.setAttribute("aria-label", "Replier le contenu de cette section");
                    if (toggle) toggle.title = "Replier le contenu";
                }
                const stickyHeader = document.querySelector("body > header");
                const headerOffset = stickyHeader?.getBoundingClientRect().height || 0;
                heading.style.scrollMarginTop = `${Math.ceil(headerOffset + 12)}px`;
                let spacer = preview.querySelector(":scope > .markdown-anchor-spacer");
                if (spacer) spacer.style.height = "0px";
                const scrollRoot = document.scrollingElement;
                const targetTop = window.scrollY + heading.getBoundingClientRect().top;
                const maxScroll = scrollRoot.scrollHeight - window.innerHeight;
                const bottomSpace = Math.max(0, Math.ceil(targetTop - headerOffset - 12 - maxScroll));
                if (bottomSpace) {
                    if (!spacer) {
                        spacer = document.createElement("div");
                        spacer.className = "markdown-anchor-spacer";
                        spacer.setAttribute("aria-hidden", "true");
                        preview.append(spacer);
                    }
                    spacer.style.height = `${bottomSpace}px`;
                } else spacer?.remove();
                window.history.pushState(null, "", `#${encodeURIComponent(targetId)}`);
                heading.scrollIntoView({ behavior: "smooth", block: "start" });
                return;
            }

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
        resizeEditor(editor);
        editor.focus();
    }

    function togglePreviewOnly(editorView, button, editor) {
        const previewOnly = editorView.classList.toggle("preview-only");
        button.setAttribute("aria-pressed", String(previewOnly));
        button.title = previewOnly ? "Revenir au mode édition" : "Afficher l’aperçu seul";
        button.querySelector("[aria-hidden='true']").textContent = previewOnly ? "✎" : "👁";
        button.querySelector(".preview-toggle-label").textContent = previewOnly ? "Mode édition" : "Aperçu seul";
        if (!previewOnly) {
            resizeEditor(editor);
            editor.focus();
        }
    }

    window.NoteEditorView = { bindHeadingCollapse, bindTaskChanges, renderMarkdown, resizeEditor, showEditor, togglePreviewOnly, waitForRender };
})();