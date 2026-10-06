(() => {
    function renderInline(tokens) {
        const fragment = document.createDocumentFragment();
        for (const token of tokens) {
            if (token.type === "text") { fragment.append(document.createTextNode(token.value)); continue; }
            const tagName = { code: "code", emphasis: "em", link: "a", strong: "strong" }[token.type];
            const element = document.createElement(tagName);
            if (token.type === "link") {
                element.setAttribute("href", token.destination);
                element.setAttribute("target", "_blank");
                element.setAttribute("rel", "noopener noreferrer");
                element.textContent = token.label;
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

    function render(ast) {
        const fragment = document.createDocumentFragment();
        const sections = [];
        for (const block of ast.blocks) {
            let element;
            if (block.type === "heading") {
                while (sections.length && sections[sections.length - 1].level >= block.level) sections.pop();
                const section = document.createElement("div");
                section.className = "markdown-section";
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
                heading.append(renderInline(block.children));
                headingRow.append(toggle, heading);
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
                const paragraph = document.createElement("p");
                paragraph.append(renderLines(block.lines));
                element.append(paragraph);
            } else if (block.type === "horizontalRule") element = document.createElement("hr");
            else if (block.type === "codeBlock") {
                element = document.createElement("pre");
                const code = document.createElement("code");
                code.textContent = block.value;
                element.append(code);
            } else if (block.type === "list") {
                element = document.createElement(block.ordered ? "ol" : "ul");
                if (block.task) element.className = "task-list";
                if (block.ordered && block.start !== 1) element.start = block.start;
                for (const item of block.items) {
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
                    element.append(listItem);
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