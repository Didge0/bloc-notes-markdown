(() => {
    function appendTokenContent(parent, content) {
        if (typeof content === "string") {
            parent.append(document.createTextNode(content));
            return;
        }
        if (Array.isArray(content)) {
            content.forEach(item => appendTokenContent(parent, item));
            return;
        }
        if (!content || typeof content !== "object") return;

        const span = document.createElement("span");
        const aliases = Array.isArray(content.alias) ? content.alias : content.alias ? [content.alias] : [];
        span.className = ["token", content.type, ...aliases].join(" ");
        appendTokenContent(span, content.content);
        parent.append(span);
    }

    function highlight(codeElement, language) {
        const languages = window.Prism?.languages;
        if (!languages || !Object.prototype.hasOwnProperty.call(languages, language) || !window.Prism?.tokenize) return false;
        const grammar = languages[language];

        const tokens = window.Prism.tokenize(codeElement.textContent, grammar);
        const fragment = document.createDocumentFragment();
        appendTokenContent(fragment, tokens);
        codeElement.replaceChildren(fragment);
        return true;
    }

    window.NoteCodeHighlighter = { highlight };
})();
