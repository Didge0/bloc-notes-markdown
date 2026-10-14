(() => {
    const exportStyles = `body{max-width:900px;margin:2rem auto;padding:0 1.5rem;color:#333;font:16px/1.6 sans-serif}h1,h2,h3{color:#8b3a3a}pre{overflow-x:auto;padding:1rem;background:#f5f5f5}code{padding:.15rem .3rem;background:#f0e5e5}pre code{padding:0;background:transparent}.markdown-mermaid{max-width:100%;overflow-x:auto;margin:1.5rem 0}.markdown-mermaid svg{display:block;max-width:100%;height:auto}.markdown-mermaid-error{color:#a12e2e;font-size:.9rem}.token.comment,.token.prolog,.token.doctype,.token.cdata{color:#667085}.token.punctuation{color:#414b57}.token.property,.token.tag,.token.constant,.token.symbol,.token.deleted{color:#9b3d3d}.token.boolean,.token.number{color:#8b4d16}.token.selector,.token.attr-name,.token.string,.token.char,.token.builtin,.token.inserted{color:#23754f}.token.operator,.token.entity,.token.url{color:#875b14}.token.atrule,.token.attr-value,.token.keyword{color:#9b3d3d;font-weight:650}.token.function,.token.class-name{color:#155e83}.token.regex,.token.important,.token.variable{color:#7650a1}.token.important,.token.bold{font-weight:700}.token.italic{font-style:italic}blockquote{border-left:4px solid #8b3a3a;padding-left:1rem;color:#666}.task-list{list-style:none;padding-left:0}.drag-handle{display:none}a{color:#8b3a3a}:root[data-theme="dark"] body{background:#1a1a1a;color:#e6e6e6}:root[data-theme="dark"] h1,:root[data-theme="dark"] h2,:root[data-theme="dark"] h3{color:#c25f5f}`;

    function build(title, content) {
        const exported = document.implementation.createHTMLDocument("");
        exported.documentElement.lang = "fr";
        const charset = document.createElement("meta");
        charset.setAttribute("charset", "UTF-8");
        const viewport = document.createElement("meta");
        viewport.name = "viewport";
        viewport.content = "width=device-width, initial-scale=1.0";
        const titleElement = document.createElement("title");
        titleElement.textContent = title;
        exported.documentElement.dataset.theme = document.documentElement.dataset.theme || "light";
        const style = document.createElement("style");
        style.textContent = exportStyles;
        exported.head.replaceChildren(charset, viewport, titleElement, style);
        const heading = document.createElement("h1");
        heading.textContent = title;
        exported.body.replaceChildren(heading, content.cloneNode(true));
        return `<!DOCTYPE html>\n${exported.documentElement.outerHTML}`;
    }

    window.NoteHtmlExport = { build };
})();