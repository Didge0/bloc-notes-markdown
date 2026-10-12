(() => {
    const languageAliases = {
        js: "javascript",
        node: "javascript",
        ts: "typescript",
        py: "python",
        html: "markup",
        xml: "markup",
        c: "cpp",
        "c++": "cpp",
        cc: "cpp",
        cxx: "cpp"
    };

    function parseFenceOpening(line) {
        const match = line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
        if (!match || (match[1][0] === "`" && match[2].includes("`"))) return null;
        const language = match[2].trim().match(/^[^\s]+/)?.[0].toLowerCase();
        const validLanguage = language && /^[a-z][a-z0-9_+-]*$/.test(language) ? language : undefined;
        return {
            marker: match[1][0],
            length: match[1].length,
            language: validLanguage
                ? Object.prototype.hasOwnProperty.call(languageAliases, validLanguage) ? languageAliases[validLanguage] : validLanguage
                : undefined
        };
    }

    function closesFence(line, fence) {
        const marker = fence.marker === "`" ? "`" : "~";
        return new RegExp(`^ {0,3}${marker}{${fence.length},}[ \\t]*$`).test(line);
    }

    function isSafeLink(destination) {
        const value = destination.trim();
        if (!value || /[\u0000-\u001f\u007f]/.test(value)) return false;
        const scheme = value.match(/^([a-z][a-z\d+.-]*):/i);
        return !scheme || ["http", "https", "mailto"].includes(scheme[1].toLowerCase());
    }

    function isSafeImage(destination) {
        const value = destination.trim();
        if (!isSafeLink(value)) return false;
        const scheme = value.match(/^([a-z][a-z\d+.-]*):/i);
        return !scheme || ["http", "https"].includes(scheme[1].toLowerCase());
    }

    function isEscapable(character) {
        return /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/u.test(character);
    }

    function closingDelimiter(text, delimiter, start) {
        let index = text.indexOf(delimiter, start);
        while (index !== -1) {
            const previous = text[index - 1] || "";
            const next = text[index + delimiter.length] || "";
            const escaped = text.slice(0, index).match(/\\+$/)?.[0].length % 2 === 1;
            const adjacentMarker = previous === delimiter[0] || next === delimiter[0];
            let markerRunStart = index;
            while (text[markerRunStart - 1] === delimiter[0]) markerRunStart -= 1;
            const runBeforeMarker = text[markerRunStart - 1] || "";
            const nestedClosingMarker = delimiter.length === 1 && previous === delimiter[0] && next !== delimiter[0]
                && /[^\s]/u.test(runBeforeMarker);
            if (!escaped && (!adjacentMarker || nestedClosingMarker) && !/\s/u.test(text[index - 1] || "")) return index;
            index = text.indexOf(delimiter, index + 1);
        }
        return -1;
    }

    function parseInline(text) {
        const tokens = [];
        let plain = "";
        const flushText = () => {
            if (plain) tokens.push({ type: "text", value: plain });
            plain = "";
        };
        for (let index = 0; index < text.length;) {
            if (text[index] === "\\" && index + 1 < text.length && isEscapable(text[index + 1])) {
                const escaped = text[index + 1];
                plain += escaped;
                index += 2;
                if ("*_~`".includes(escaped)) {
                    while (text[index] === escaped) {
                        plain += escaped;
                        index += 1;
                    }
                }
                continue;
            }

            if (text[index] === "`") {
                let delimiterEnd = index;
                while (text[delimiterEnd] === "`") delimiterEnd += 1;
                const delimiter = text.slice(index, delimiterEnd);
                let closing = text.indexOf(delimiter, delimiterEnd);
                while (closing !== -1 && (text[closing - 1] === "`" || text[closing + delimiter.length] === "`")) {
                    closing = text.indexOf(delimiter, closing + 1);
                }
                if (closing !== -1) {
                    flushText();
                    let value = text.slice(delimiterEnd, closing).replace(/\n/g, " ");
                    if (/^ .* $/u.test(value) && /\S/u.test(value)) value = value.slice(1, -1);
                    tokens.push({ type: "code", value });
                    index = closing + delimiter.length;
                    continue;
                }
            }

            const image = text.slice(index).match(/^!\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+?)\)/);
            const link = text.slice(index).match(/^\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+?)\)/);
            if (image) {
                const destination = image[2].trim();
                if (isSafeImage(destination)) {
                    flushText();
                    tokens.push({ type: "image", alt: image[1], destination });
                } else plain += image[0];
                index += image[0].length;
                continue;
            }
            if (link) {
                const destination = link[2].trim();
                flushText();
                tokens.push(isSafeLink(destination)
                    ? { type: "link", label: link[1], destination }
                    : { type: "text", value: link[1] });
                index += link[0].length;
                continue;
            }

            const delimiters = ["***", "___", "**", "__", "~~", "*", "_"];
            const delimiter = delimiters.find(candidate => text.startsWith(candidate, index));
            const underscoreOpener = delimiter?.[0] !== "_" || !/[\p{L}\p{N}]/u.test(text[index - 1] || "");
            if (delimiter && underscoreOpener) {
                const closing = closingDelimiter(text, delimiter, index + delimiter.length);
                if (closing !== -1) {
                    const content = text.slice(index + delimiter.length, closing);
                    if (content && !/^\s|\s$/u.test(content)) {
                        flushText();
                        const children = parseInline(content);
                        const type = delimiter.length === 3 ? "strongEmphasis"
                            : delimiter[0] === "~" ? "strike"
                                : delimiter.length === 2 ? "strong" : "emphasis";
                        tokens.push(type === "strike" ? { type, value: content } : { type, children });
                        index = closing + delimiter.length;
                        continue;
                    }
                }
            }

            plain += text[index];
            index += 1;
        }
        flushText();
        return tokens;
    }

    function splitTableRow(line) {
        let value = line.trim();
        if (value.startsWith("|")) value = value.slice(1);
        if (value.endsWith("|") && !value.endsWith("\\|")) value = value.slice(0, -1);
        return value.split(/(?<!\\)\|/).map(cell => cell.trim().replace(/\\\|/g, "|"));
    }

    function parseTableAlignment(cell) {
        if (!/^:?-{3,}:?$/.test(cell)) return null;
        if (cell.startsWith(":") && cell.endsWith(":")) return "center";
        if (cell.endsWith(":")) return "right";
        if (cell.startsWith(":")) return "left";
        return null;
    }

    function parse(markdown) {
        const lines = String(markdown).replace(/\r\n?/g, "\n").split("\n");
        const blocks = [];
        let paragraph = [];
        let quote = [];
        let list = null;
        let code = null;
        const flushParagraph = () => {
            if (paragraph.length) blocks.push({ type: "paragraph", lines: paragraph.map(parseInline) });
            paragraph = [];
        };
        const flushQuote = () => {
            if (quote.length) {
                const paragraphs = [];
                let current = [];
                for (const line of quote) {
                    if (line === "") {
                        if (current.length) paragraphs.push(current.map(parseInline));
                        current = [];
                    } else current.push(line);
                }
                if (current.length) paragraphs.push(current.map(parseInline));
                if (paragraphs.length) blocks.push({ type: "blockquote", paragraphs });
            }
            quote = [];
        };
        const flushList = () => {
            if (list) {
                const parents = [];
                for (const item of list.items) {
                    while (parents.length && parents[parents.length - 1].indent >= item.indent) parents.pop();
                    if (parents.length) parents[parents.length - 1].endLine = item.endLine;
                    parents.push(item);
                }
                blocks.push(list);
            }
            list = null;
        };
        const flushBlocks = () => { flushParagraph(); flushQuote(); flushList(); };

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
            const line = lines[lineIndex];
            if (code) {
                if (closesFence(line, code.fence)) {
                    blocks.push({ type: "codeBlock", value: code.lines.join("\n"), language: code.fence.language });
                    code = null;
                } else code.lines.push(line);
                continue;
            }
            const fence = parseFenceOpening(line);
            if (fence) { flushBlocks(); code = { fence, lines: [] }; continue; }

            const heading = line.match(/^(#{1,6})\s+(.+)$/);
            const task = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/);
            const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
            const ordered = line.match(/^\s*(\d+)[.)](?:\s+(.*)|\s*)$/);
            const blockquote = line.match(/^\s*>\s?(.*)$/);
            const listContinuation = list && /^(?: {2,}|\t)\S/.test(line);
            const nextLine = lines[lineIndex + 1] || "";
            const tableAlignment = lineIndex + 1 < lines.length ? splitTableRow(nextLine).map(parseTableAlignment) : null;
            const tableHeader = (line.includes("|") || nextLine.includes("|"))
                && tableAlignment?.length
                && tableAlignment.every(alignment => alignment !== null)
                ? splitTableRow(line)
                : null;

            if (!line.trim()) flushBlocks();
            else if (tableHeader) {
                flushBlocks();
                const width = Math.max(tableHeader.length, tableAlignment.length);
                const headers = Array.from({ length: width }, (_, index) => parseInline(tableHeader[index] || ""));
                const alignments = Array.from({ length: width }, (_, index) => tableAlignment[index] || null);
                const rows = [];
                lineIndex += 1;
                while (lineIndex + 1 < lines.length && lines[lineIndex + 1].includes("|")) {
                    lineIndex += 1;
                    const cells = splitTableRow(lines[lineIndex]);
                    rows.push(Array.from({ length: width }, (_, index) => parseInline(cells[index] || "")));
                }
                blocks.push({ type: "table", headers, alignments, rows });
            } else if (heading) {
                flushBlocks();
                blocks.push({ type: "heading", level: heading[1].length, line: lineIndex, children: parseInline(heading[2]) });
            } else if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
                flushBlocks();
                blocks.push({ type: "horizontalRule" });
            } else if (blockquote) { flushParagraph(); flushList(); quote.push(blockquote[1]); }
            else if (task) {
                flushParagraph(); flushQuote();
                if (list && !list.task) flushList();
                if (!list) list = { type: "list", ordered: false, task: true, start: 1, items: [] };
                const indent = line.match(/^\s*/)[0].replace(/\t/g, "    ").length;
                list.items.push({ checked: task[1].toLowerCase() === "x", line: lineIndex, endLine: lineIndex, indent, children: parseInline(task[2]) });
            } else if (bullet || ordered) {
                flushParagraph(); flushQuote();
                const isOrdered = Boolean(ordered);
                if (list && (list.task || list.ordered !== isOrdered)) flushList();
                if (!list) list = { type: "list", ordered: isOrdered, task: false, start: isOrdered ? Number(ordered[1]) : 1, items: [] };
                const indent = line.match(/^\s*/)[0].replace(/\t/g, "    ").length;
                list.items.push({ line: lineIndex, endLine: lineIndex, indent, children: parseInline(isOrdered ? (ordered[2] || "") : bullet[1]) });
            } else if (listContinuation) {
                const lastItem = list.items[list.items.length - 1];
                lastItem.continuation = parseInline(line.trim());
                lastItem.endLine = lineIndex;
            } else { flushQuote(); flushList(); paragraph.push(line.trim().replace(/\\$/, "")); }
        }
        if (code) blocks.push({ type: "codeBlock", value: code.lines.join("\n"), language: code.fence.language });
        flushBlocks();
        const headings = blocks.filter(block => block.type === "heading");
        headings.forEach((current, index) => {
            const next = headings.slice(index + 1).find(other => other.level <= current.level);
            current.endLine = next ? next.line - 1 : lines.length - 1;
        });
        return { type: "document", blocks };
    }

    window.MarkdownParser = { parse };
})();