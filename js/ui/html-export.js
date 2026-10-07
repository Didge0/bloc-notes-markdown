(() => {
    const exportStyles = `body{max-width:900px;margin:2rem auto;padding:0 1.5rem;color:#333;font:16px/1.6 sans-serif}h1,h2,h3{color:#8b3a3a}pre{overflow-x:auto;padding:1rem;background:#f5f5f5}code{padding:.15rem .3rem;background:#f0e5e5}pre code{padding:0;background:transparent}blockquote{border-left:4px solid #8b3a3a;padding-left:1rem;color:#666}.task-list{list-style:none;padding-left:0}.drag-handle{display:none}a{color:#8b3a3a}`;

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