(() => {
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

    function parseInline(text) {
        const pattern = /`([^`]+)`|!\[([^\]]*)\]\(((?:[^()\s]|\([^()\s]*\))+)\)|\[([^\]]+)\]\(((?:[^()\s]|\([^()\s]*\))+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_|~~([^~]+)~~/g;
        const tokens = [];
        let lastIndex = 0;
        for (const match of text.matchAll(pattern)) {
            if (match.index > lastIndex) tokens.push({ type: "text", value: text.slice(lastIndex, match.index) });
            if (match[1] !== undefined) tokens.push({ type: "code", value: match[1] });
            else if (match[2] !== undefined) {
                if (isSafeImage(match[3])) tokens.push({ type: "image", alt: match[2], destination: match[3].trim() });
                else tokens.push({ type: "text", value: match[0] });
            } else if (match[4] !== undefined) {
                if (isSafeLink(match[5])) tokens.push({ type: "link", label: match[4], destination: match[5].trim() });
                else tokens.push({ type: "text", value: match[4] });
            } else if (match[6] !== undefined || match[7] !== undefined) {
                tokens.push({ type: "strong", value: match[6] ?? match[7] });
            } else if (match[10] !== undefined) tokens.push({ type: "strike", value: match[10] });
            else tokens.push({ type: "emphasis", value: match[8] ?? match[9] });
            lastIndex = match.index + match[0].length;
        }
        if (lastIndex < text.length) tokens.push({ type: "text", value: text.slice(lastIndex) });
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
            if (list) blocks.push(list);
            list = null;
        };
        const flushBlocks = () => { flushParagraph(); flushQuote(); flushList(); };

        for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
            const line = lines[lineIndex];
            if (code) {
                if (/^\s*```/.test(line)) {
                    blocks.push({ type: "codeBlock", value: code.join("\n") });
                    code = null;
                } else code.push(line);
                continue;
            }
            if (/^\s*```/.test(line)) { flushBlocks(); code = []; continue; }

            const heading = line.match(/^(#{1,3})\s+(.+)$/);
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
                list.items.push({ checked: task[1].toLowerCase() === "x", line: lineIndex, endLine: lineIndex, children: parseInline(task[2]) });
            } else if (bullet || ordered) {
                flushParagraph(); flushQuote();
                const isOrdered = Boolean(ordered);
                if (list && (list.task || list.ordered !== isOrdered)) flushList();
                if (!list) list = { type: "list", ordered: isOrdered, task: false, start: isOrdered ? Number(ordered[1]) : 1, items: [] };
                list.items.push({ line: lineIndex, endLine: lineIndex, children: parseInline(isOrdered ? (ordered[2] || "") : bullet[1]) });
            } else if (listContinuation) {
                const lastItem = list.items[list.items.length - 1];
                lastItem.continuation = parseInline(line.trim());
                lastItem.endLine = lineIndex;
            } else { flushQuote(); flushList(); paragraph.push(line.trim()); }
        }
        if (code) blocks.push({ type: "codeBlock", value: code.join("\n") });
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