function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function renderInlineMarkdown(text) {
    const pattern = /`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_/g;
    let result = "";
    let lastIndex = 0;

    for (const match of text.matchAll(pattern)) {
        result += escapeHtml(text.slice(lastIndex, match.index));

        if (match[1] !== undefined) {
            result += `<code>${escapeHtml(match[1])}</code>`;
        } else if (match[2] !== undefined) {
            if (isSafeLink(match[3])) {
                result += `<a href="${escapeHtml(match[3])}" target="_blank" rel="noopener noreferrer">${escapeHtml(match[2])}</a>`;
            } else {
                result += escapeHtml(match[2]);
            }
        } else if (match[4] !== undefined || match[5] !== undefined) {
            result += `<strong>${escapeHtml(match[4] ?? match[5])}</strong>`;
        } else {
            result += `<em>${escapeHtml(match[6] ?? match[7])}</em>`;
        }

        lastIndex = match.index + match[0].length;
    }

    return result + escapeHtml(text.slice(lastIndex));
}

function isSafeLink(destination) {
    const value = destination.trim();
    if (!value || /[\u0000-\u001f\u007f]/.test(value)) return false;

    const scheme = value.match(/^([a-z][a-z\d+.-]*):/i);
    return !scheme || ["http", "https", "mailto"].includes(scheme[1].toLowerCase());
}

function renderMarkdown(markdown) {
    const lines = String(markdown).replace(/\r\n?/g, "\n").split("\n");
    const output = [];
    let paragraph = [];
    let quote = [];
    let list = null;
    let code = null;

    const flushParagraph = () => {
        if (paragraph.length) output.push(`<p>${renderInlineMarkdown(paragraph.join(" "))}</p>`);
        paragraph = [];
    };
    const flushQuote = () => {
        if (quote.length) output.push(`<blockquote><p>${quote.map(renderInlineMarkdown).join("<br>")}</p></blockquote>`);
        quote = [];
    };
    const flushList = () => {
        if (!list) return;
        const className = list.task ? ' class="task-list"' : "";
        output.push(`<${list.tag}${className}>${list.items.join("")}</${list.tag}>`);
        list = null;
    };
    const flushBlocks = () => {
        flushParagraph();
        flushQuote();
        flushList();
    };

    for (const line of lines) {
        if (code) {
            if (/^\s*```/.test(line)) {
                output.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
                code = null;
            } else {
                code.push(line);
            }
            continue;
        }

        if (/^\s*```/.test(line)) {
            flushBlocks();
            code = [];
            continue;
        }

        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        const task = line.match(/^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/);
        const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
        const ordered = line.match(/^\s*\d+[.)]\s+(.*)$/);
        const blockquote = line.match(/^\s*>\s?(.*)$/);

        if (!line.trim()) {
            flushBlocks();
        } else if (heading) {
            flushBlocks();
            const level = heading[1].length;
            output.push(`<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`);
        } else if (/^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
            flushBlocks();
            output.push("<hr>");
        } else if (blockquote) {
            flushParagraph();
            flushList();
            quote.push(blockquote[1]);
        } else if (task) {
            flushParagraph();
            flushQuote();
            if (list && !list.task) flushList();
            if (!list) list = { tag: "ul", task: true, items: [] };
            const checked = task[1].toLowerCase() === "x" ? " checked" : "";
            list.items.push(`<li><input type="checkbox" disabled${checked}>${renderInlineMarkdown(task[2])}</li>`);
        } else if (bullet || ordered) {
            flushParagraph();
            flushQuote();
            const tag = ordered ? "ol" : "ul";
            if (list && (list.task || list.tag !== tag)) flushList();
            if (!list) list = { tag, task: false, items: [] };
            list.items.push(`<li>${renderInlineMarkdown((ordered || bullet)[1])}</li>`);
        } else {
            flushQuote();
            flushList();
            paragraph.push(line.trim());
        }
    }

    if (code) output.push(`<pre><code>${escapeHtml(code.join("\n"))}</code></pre>`);
    flushBlocks();
    return output.join("\n");
}

window.MarkdownRenderer = { escapeHtml, render: renderMarkdown };