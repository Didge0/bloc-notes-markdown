(() => {
    function renderInline(tokens) {
        const fragment = document.createDocumentFragment();
        const entityDecoder = document.createElement("textarea");
        for (const token of tokens) {
            if (token.type === "text") {
                entityDecoder.innerHTML = token.value;
                fragment.append(document.createTextNode(entityDecoder.value));
                continue;
            }
            if (token.type === "image") {
                const image = document.createElement("img");
                image.src = token.destination;
                image.alt = token.alt;
                image.loading = "lazy";
                fragment.append(image);
                continue;
            }
            const tagName = { code: "code", emphasis: "em", link: "a", strike: "del", strong: "strong", strongEmphasis: "strong" }[token.type];
            const element = document.createElement(tagName);
            if (token.type === "link") {
                element.setAttribute("href", token.destination);
                if (!token.destination.startsWith("#")) {
                    element.setAttribute("target", "_blank");
                    element.setAttribute("rel", "noopener noreferrer");
                }
                element.textContent = token.label;
            } else if (token.type === "strong" || token.type === "emphasis") element.append(renderInline(token.children));
            else if (token.type === "strongEmphasis") {
                const emphasis = document.createElement("em");
                emphasis.append(renderInline(token.children));
                element.append(emphasis);
            } else element.textContent = token.value;
            fragment.append(element);
        }
        return fragment;
    }

    function renderLines(lines) {
        const fragment = document.createDocumentFragment();
        lines.forEach((tokens, index) => {
            if (index) fragment.append(document.createElement("br"));
            fragment.append(renderInline(tokens));
        });
        return fragment;
    }

    function createDragHandle(label) {
        const handle = document.createElement("button");
        handle.type = "button";
        handle.className = "drag-handle";
        handle.draggable = true;
        handle.textContent = "⠿";
        handle.setAttribute("aria-label", label);
        handle.setAttribute("aria-keyshortcuts", "ArrowUp ArrowDown");
        handle.title = `${label} : glisser, ou flèches haut et bas au clavier`;
        return handle;
    }

    function headingSlug(tokens) {
        const text = tokens.map(token => token.type === "text" ? token.value
            : token.type === "image" ? token.alt
                : token.type === "link" ? token.label
                    : token.children ? headingSlug(token.children) : token.value).join("");
        return text.trim().toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s/g, "-") || "section";
    }

    function render(ast) {
        const fragment = document.createDocumentFragment();
        const sections = [];
        const headingSlugs = new Map();
        for (const block of ast.blocks) {
            let element;
            if (block.type === "heading") {
                while (sections.length && sections[sections.length - 1].level >= block.level) sections.pop();
                const section = document.createElement("div");
                section.className = "markdown-section";
                section.dataset.line = String(block.line);
                section.dataset.endLine = String(block.endLine);
                section.dataset.level = String(block.level);
                const headingRow = document.createElement("div");
                headingRow.className = "markdown-section-heading";
                const toggle = document.createElement("button");
                toggle.type = "button";
                toggle.className = "markdown-collapse-toggle";
                toggle.setAttribute("aria-expanded", "true");
                toggle.setAttribute("aria-label", "Replier le contenu de cette section");
                toggle.title = "Replier le contenu";
                const chevron = document.createElement("span");
                chevron.className = "markdown-collapse-icon";
                chevron.setAttribute("aria-hidden", "true");
                toggle.append(chevron);
                const heading = document.createElement(`h${block.level}`);
                const slug = headingSlug(block.children);
                const slugCount = headingSlugs.get(slug) || 0;
                headingSlugs.set(slug, slugCount + 1);
                heading.id = slugCount ? `${slug}-${slugCount}` : slug;
                heading.append(renderInline(block.children));
                headingRow.append(toggle, heading, createDragHandle("Déplacer ce titre et son contenu"));
                const content = document.createElement("div");
                content.className = "markdown-section-content";
                section.append(headingRow, content);
                const parent = sections.length ? sections[sections.length - 1].content : fragment;
                parent.append(section);
                sections.push({ level: block.level, content });
                continue;
            } else if (block.type === "paragraph") {
                element = document.createElement("p");
                element.append(renderLines(block.lines));
            } else if (block.type === "blockquote") {
                element = document.createElement("blockquote");
                for (const lines of block.paragraphs) {
                    const paragraph = document.createElement("p");
                    paragraph.append(renderLines(lines));
                    element.append(paragraph);
                }
            } else if (block.type === "table") {
                element = document.createElement("div");
                element.className = "markdown-table-wrapper";
                const table = document.createElement("table");
                const head = document.createElement("thead");
                const headerRow = document.createElement("tr");
                block.headers.forEach((tokens, index) => {
                    const cell = document.createElement("th");
                    if (block.alignments[index]) cell.style.textAlign = block.alignments[index];
                    cell.append(renderInline(tokens));
                    headerRow.append(cell);
                });
                head.append(headerRow);
                table.append(head);
                if (block.rows.length) {
                    const body = document.createElement("tbody");
                    for (const row of block.rows) {
                        const rowElement = document.createElement("tr");
                        row.forEach((tokens, index) => {
                            const cell = document.createElement("td");
                            if (block.alignments[index]) cell.style.textAlign = block.alignments[index];
                            cell.append(renderInline(tokens));
                            rowElement.append(cell);
                        });
                        body.append(rowElement);
                    }
                    table.append(body);
                }
                element.append(table);
            } else if (block.type === "horizontalRule") element = document.createElement("hr");
            else if (block.type === "codeBlock") {
                element = document.createElement(block.language === "mermaid" ? "div" : "pre");
                if (block.language === "mermaid") element.className = "markdown-mermaid";
                const code = document.createElement("code");
                code.textContent = block.value;
                if (block.language && /^[a-z][a-z0-9_-]*$/.test(block.language)) code.classList.add(`language-${block.language}`);
                if (block.language === "mermaid") {
                    const source = document.createElement("pre");
                    source.append(code);
                    element.append(source);
                } else {
                    window.NoteCodeHighlighter?.highlight(code, block.language);
                    element.append(code);
                }
            } else if (block.type === "list") {
                element = document.createElement(block.ordered ? "ol" : "ul");
                if (block.task) element.className = "task-list";
                if (block.ordered && block.start !== 1) element.start = block.start;
                const listStack = [{ indent: block.items[0]?.indent || 0, element, lastItem: null }];
                for (const item of block.items) {
                    while (listStack.length > 1 && item.indent < listStack[listStack.length - 1].indent) listStack.pop();
                    if (item.indent > listStack[listStack.length - 1].indent) {
                        const parent = listStack[listStack.length - 1];
                        const nestedList = document.createElement(block.ordered ? "ol" : "ul");
                        parent.lastItem?.append(nestedList);
                        listStack.push({ indent: item.indent, element: nestedList, lastItem: null });
                    }
                    const currentList = listStack[listStack.length - 1];
                    const listItem = document.createElement("li");
                    if (block.task) {
                        const checkbox = document.createElement("input");
                        checkbox.type = "checkbox";
                        checkbox.checked = item.checked;
                        checkbox.dataset.taskLine = String(item.line);
                        checkbox.setAttribute("aria-label", "Marquer la tâche comme terminée");
                        listItem.append(checkbox);
                    }
                    listItem.append(renderInline(item.children));
                    if (item.continuation) listItem.append(document.createElement("br"), renderInline(item.continuation));
                    listItem.dataset.line = String(item.line);
                    listItem.dataset.endLine = String(item.endLine);
                    listItem.append(createDragHandle("Déplacer cet élément"));
                    currentList.element.append(listItem);
                    currentList.lastItem = listItem;
                }
            }
            if (element) {
                const parent = sections.length ? sections[sections.length - 1].content : fragment;
                parent.append(element);
            }
        }
        return fragment;
    }

    window.MarkdownRenderer = { render };
})();