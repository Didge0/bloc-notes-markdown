(() => {
    let pendingDiagramRender = Promise.resolve();
    const alignmentVersions = new WeakMap();

    function clearHeadingAlignment(preview) {
        if (!preview) return;
        preview.querySelectorAll(".markdown-heading-spacer").forEach(spacer => spacer.remove());
    }

    function createEditorMirror(editor) {
        const style = getComputedStyle(editor);
        const mirror = document.createElement("div");
        const copiedProperties = [
            "font", "fontFamily", "fontSize", "fontWeight", "fontStyle", "lineHeight", "letterSpacing",
            "wordSpacing", "textIndent", "textTransform", "tabSize", "direction", "paddingTop", "paddingRight",
            "paddingBottom", "paddingLeft", "borderTopWidth", "borderRightWidth", "borderBottomWidth", "borderLeftWidth"
        ];
        copiedProperties.forEach(property => { mirror.style[property] = style[property]; });
        mirror.style.position = "fixed";
        mirror.style.top = `${editor.getBoundingClientRect().top}px`;
        mirror.style.left = `${editor.getBoundingClientRect().left}px`;
        mirror.style.width = `${editor.clientWidth}px`;
        mirror.style.height = "auto";
        mirror.style.boxSizing = "border-box";
        mirror.style.visibility = "hidden";
        mirror.style.pointerEvents = "none";
        mirror.style.whiteSpace = "pre-wrap";
        mirror.style.overflowWrap = "break-word";
        mirror.setAttribute("aria-hidden", "true");
        const lines = editor.value.split("\n");
        const lineElements = lines.map(line => {
            const element = document.createElement("div");
            element.style.minHeight = style.lineHeight === "normal" ? `${parseFloat(style.fontSize) * 1.2}px` : style.lineHeight;
            element.style.whiteSpace = "pre-wrap";
            element.style.overflowWrap = "break-word";
            element.textContent = line || " ";
            mirror.append(element);
            return element;
        });
        document.body.append(mirror);
        return { mirror, lineElements };
    }

    function naturalPreviewHeight(preview) {
        const lastContent = [...preview.children].filter(element => !element.classList.contains("markdown-heading-spacer")).at(-1);
        if (!lastContent) return 0;
        const previewStyle = getComputedStyle(preview);
        const contentStyle = getComputedStyle(lastContent);
        return lastContent.getBoundingClientRect().bottom - preview.getBoundingClientRect().top
            + parseFloat(previewStyle.paddingBottom)
            + parseFloat(contentStyle.marginBottom);
    }

    function collapsedLineRanges(preview) {
        const ranges = [...preview.querySelectorAll(".markdown-section")]
            .filter(section => section.querySelector(":scope > .markdown-section-content")?.hidden)
            .map(section => ({ start: Number(section.dataset.line) + 1, end: Number(section.dataset.endLine) }))
            .filter(range => Number.isInteger(range.start) && Number.isInteger(range.end) && range.start <= range.end)
            .sort((first, second) => first.start - second.start);
        const merged = [];
        for (const range of ranges) {
            const previous = merged.at(-1);
            if (previous && range.start <= previous.end + 1) previous.end = Math.max(previous.end, range.end);
            else merged.push(range);
        }
        return merged;
    }

    function alignHeadings(editor, preview) {
        if (!preview) return;
        clearHeadingAlignment(preview);
        if (!editor || !preview || !editor.getClientRects().length || !preview.getClientRects().length
            || editor.closest(".preview-only") || getComputedStyle(preview).display === "none"
            || editor.scrollHeight <= naturalPreviewHeight(preview)) return;

        const version = (alignmentVersions.get(preview) || 0) + 1;
        alignmentVersions.set(preview, version);
        const { mirror, lineElements } = createEditorMirror(editor);
        const editorTop = editor.getBoundingClientRect().top;
        const mirrorTop = mirror.getBoundingClientRect().top;
        const lineHeights = [0];
        for (const lineElement of lineElements) lineHeights.push(lineHeights.at(-1) + lineElement.getBoundingClientRect().height);
        const hiddenRanges = collapsedLineRanges(preview);
        let hiddenRangeIndex = 0;
        let hiddenSourceHeight = 0;
        const headings = [...preview.querySelectorAll(".markdown-section[data-line]")]
            .map(section => ({ section, line: Number(section.dataset.line), heading: section.querySelector(":scope > .markdown-section-heading h1, :scope > .markdown-section-heading h2, :scope > .markdown-section-heading h3, :scope > .markdown-section-heading h4, :scope > .markdown-section-heading h5, :scope > .markdown-section-heading h6") }))
            .filter(item => item.heading && Number.isInteger(item.line) && lineElements[item.line])
            .sort((first, second) => first.line - second.line);

        for (const { section, line, heading } of headings) {
            if (alignmentVersions.get(preview) !== version || editor.closest(".preview-only")) break;
            if (heading.closest(".markdown-section-content[hidden]")) continue;
            while (hiddenRangeIndex < hiddenRanges.length && hiddenRanges[hiddenRangeIndex].end < line) {
                const range = hiddenRanges[hiddenRangeIndex];
                hiddenSourceHeight += lineHeights[range.end + 1] - lineHeights[range.start];
                hiddenRangeIndex += 1;
            }
            const editorLineTop = editorTop + lineElements[line].getBoundingClientRect().top - mirrorTop - hiddenSourceHeight;
            const difference = editorLineTop - heading.getBoundingClientRect().top;
            if (difference <= 1) continue;
            const spacer = document.createElement("div");
            spacer.className = "markdown-heading-spacer";
            spacer.style.height = `${difference}px`;
            spacer.setAttribute("aria-hidden", "true");
            section.insertBefore(spacer, section.firstChild);
            for (let attempt = 0; attempt < 3; attempt += 1) {
                const correction = editorLineTop - heading.getBoundingClientRect().top;
                if (Math.abs(correction) <= 1) break;
                const height = Math.max(0, parseFloat(spacer.style.height) + correction);
                spacer.style.height = `${height}px`;
            }
        }
        mirror.remove();
    }

    function resizeEditor(editor) {
        if (!editor.getClientRects().length) return;
        editor.style.height = "0px";
        editor.style.height = `${editor.scrollHeight}px`;
    }

    function collapsedHeadingIds(preview) {
        return new Set([...preview.querySelectorAll(".markdown-section")]
            .filter(section => section.querySelector(":scope > .markdown-section-content")?.hidden)
            .map(section => section.querySelector(":scope > .markdown-section-heading h1, :scope > .markdown-section-heading h2, :scope > .markdown-section-heading h3, :scope > .markdown-section-heading h4, :scope > .markdown-section-heading h5, :scope > .markdown-section-heading h6")?.id)
            .filter(Boolean));
    }

    function restoreCollapsedHeadings(preview, collapsedIds) {
        for (const section of preview.querySelectorAll(".markdown-section")) {
            const heading = section.querySelector(":scope > .markdown-section-heading h1, :scope > .markdown-section-heading h2, :scope > .markdown-section-heading h3, :scope > .markdown-section-heading h4, :scope > .markdown-section-heading h5, :scope > .markdown-section-heading h6");
            if (!heading || !collapsedIds.has(heading.id)) continue;
            section.querySelector(":scope > .markdown-section-content").hidden = true;
            const toggle = section.querySelector(":scope > .markdown-section-heading > .markdown-collapse-toggle");
            toggle?.setAttribute("aria-expanded", "false");
            toggle?.setAttribute("aria-label", "Déplier le contenu de cette section");
            if (toggle) toggle.title = "Déplier le contenu";
        }
    }

    function renderMarkdown(editor, preview, wordCount) {
        resizeEditor(editor);
        const collapsedIds = collapsedHeadingIds(preview);
        const ast = MarkdownParser.parse(editor.value);
        preview.replaceChildren(MarkdownRenderer.render(ast));
        restoreCollapsedHeadings(preview, collapsedIds);
        const diagramRender = window.NoteMermaidRenderer?.render(preview) || Promise.resolve();
        pendingDiagramRender = diagramRender.then(() => alignHeadings(editor, preview));
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

    function bindHeadingCollapse(preview, editor) {
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
                alignHeadings(editor, preview);
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
            alignHeadings(editor, preview);
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
        alignHeadings(editor, document.getElementById("preview"));
        editor.focus();
    }

    function togglePreviewOnly(editorView, button, editor) {
        const previewOnly = editorView.classList.toggle("preview-only");
        button.setAttribute("aria-pressed", String(previewOnly));
        button.title = previewOnly ? "Revenir au mode édition" : "Afficher l’aperçu seul";
        button.querySelector("[aria-hidden='true']").textContent = previewOnly ? "✎" : "👁";
        button.querySelector(".preview-toggle-label").textContent = previewOnly ? "Mode édition" : "Aperçu seul";
        const preview = document.getElementById("preview");
        if (previewOnly) clearHeadingAlignment(preview);
        else {
            resizeEditor(editor);
            alignHeadings(editor, preview);
            editor.focus();
        }
    }

    window.NoteEditorView = { alignHeadings, bindHeadingCollapse, bindTaskChanges, clearHeadingAlignment, renderMarkdown, resizeEditor, showEditor, togglePreviewOnly, waitForRender };
})();