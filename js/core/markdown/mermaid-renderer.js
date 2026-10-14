(() => {
    let nextDiagramId = 0;
    let activeTheme = null;
    let pendingRender = Promise.resolve();
    let themeObserver = null;
    const renderVersions = new WeakMap();

    function currentTheme() {
        return document.documentElement.dataset.theme === "dark" ? "dark" : "default";
    }

    function initialize() {
        const theme = currentTheme();
        if (activeTheme !== theme) {
            window.mermaid.initialize({ startOnLoad: false, securityLevel: "strict", suppressErrorRendering: true, theme });
            activeTheme = theme;
        }
        if (!themeObserver) {
            themeObserver = new MutationObserver(() => {
                if (currentTheme() === activeTheme) return;
                document.querySelectorAll(".preview-content").forEach(preview => { void render(preview); });
            });
            themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
        }
    }

    function parseSvg(source) {
        const document = new DOMParser().parseFromString(source, "image/svg+xml");
        const svg = document.documentElement;
        if (svg.localName !== "svg" || document.querySelector("parsererror")) {
            throw new Error("Mermaid returned invalid SVG");
        }
        svg.querySelectorAll("script").forEach(element => element.remove());
        [svg, ...svg.querySelectorAll("*")].forEach(element => {
            for (const attribute of [...element.attributes]) {
                if (/^on/i.test(attribute.name)) element.removeAttribute(attribute.name);
                if (["href", "xlink:href"].includes(attribute.name.toLowerCase())
                    && /^\s*(?:javascript|data):/i.test(attribute.value)) element.removeAttribute(attribute.name);
            }
        });
        return document.importNode(svg, true);
    }

    async function render(preview) {
        const diagrams = [...preview.querySelectorAll(".markdown-mermaid")];
        if (!diagrams.length || !window.mermaid?.render) return;
        initialize();
        const theme = activeTheme;

        pendingRender = Promise.all(diagrams.map(async container => {
            const version = (renderVersions.get(container) || 0) + 1;
            renderVersions.set(container, version);
            const source = container.dataset.mermaidSource || container.querySelector("code")?.textContent || "";
            container.dataset.mermaidSource = source;
            container.querySelector(".markdown-mermaid-error")?.remove();
            try {
                const { svg: markup } = await window.mermaid.render(`note-mermaid-${nextDiagramId++}`, source);
                if (!preview.contains(container) || renderVersions.get(container) !== version || currentTheme() !== theme) return;
                const svg = parseSvg(markup);
                container.replaceChildren(svg);
                container.classList.add("is-rendered");
            } catch {
                if (!preview.contains(container) || renderVersions.get(container) !== version || currentTheme() !== theme) return;
                const message = document.createElement("p");
                message.className = "markdown-mermaid-error";
                message.setAttribute("role", "status");
                message.textContent = "Diagramme Mermaid invalide; le code source est conservé.";
                container.append(message);
            }
        }));
        await pendingRender;
    }

    async function waitForRender() {
        let render;
        do {
            render = pendingRender;
            await render;
        } while (render !== pendingRender);
    }

    window.NoteMermaidRenderer = { render, waitForRender };
})();