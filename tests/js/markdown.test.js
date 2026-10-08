(() => {
    const sharePointUrl = "https://sncf.sharepoint.com/:x:/r/sites/TELEDIAG_SPDC/Documents%20partages/Affaires/ORDO_ordo%20correctif%20(SC-2019-00425)/02%20-%20Documentation%20donn%C3%A9es%20entr%C3%A9e%20et%20process/04%20-%20Donnees%20STF%20pour%20utilisation%20OrdoC/Correspondance%20Site%20Ordo%20C.xlsx?d=w745aa0f3f00a4bb39bfad35f31539f0b&csf=1&web=1&e=bgplHq";
    const cases = [
        ["contenu vide", "", ""],
        ["titres", "# Titre\n\n## Sous-titre\n### Niveau 3\n#### Niveau 4\n##### Niveau 5\n###### Niveau 6", "<h1>Titre</h1><h2>Sous-titre</h2><h3>Niveau 3</h3><h4>Niveau 4</h4><h5>Niveau 5</h5><h6>Niveau 6</h6>"],
        ["emphase et code", "**fort** *fin* `x < y`", "<p><strong>fort</strong> <em>fin</em> <code>x &lt; y</code></p>"],
        ["emphase imbriquée", "***fort italique*** et **fort avec _italique_ et `code`**, puis *italique avec **fort***", "<p><strong><em>fort italique</em></strong> et <strong>fort avec <em>italique</em> et <code>code</code></strong>, puis <em>italique avec <strong>fort</strong></em></p>"],
        ["code inline avec plusieurs accents graves", "``un ` caractère`` et `` `espaces conservées` ``", "<p><code>un ` caractère</code> et <code>`espaces conservées`</code></p>"],
        ["retours à la ligne", "Prévu demain.\nEffectué demain.\n\nPremière ligne avec deux espaces.  \nSaut explicite.\\\nAutre ligne.", "<p>Prévu demain.<br>Effectué demain.</p><p>Première ligne avec deux espaces.<br>Saut explicite.<br>Autre ligne.</p>"],
        ["échappement des caractères Markdown", "\\*Pas en italique\\*, \\**pas en gras\\**, \\# pas un titre, \\[pas un lien\\], \\`pas du code\\`, \\> pas une citation", "<p>*Pas en italique*, **pas en gras**, # pas un titre, [pas un lien], `pas du code`, &gt; pas une citation</p>"],
        ["entités HTML sûres", "&amp; &lt; &gt; &copy; A&nbsp;B", "<p>&amp; &lt; &gt; © A&nbsp;B</p>"],
        ["texte barré", "~~annulé~~ et **gardé**", "<p><del>annulé</del> et <strong>gardé</strong></p>"],
        ["texte barré dans une puce", "- ~~fait~~ reste", "<ul><li><del>fait</del> reste</li></ul>"],
        ["listes à puces", "- un\n- deux", "<ul><li>un</li><li>deux</li></ul>"],
        ["liste numérotée", "1. un\n2. deux", "<ol><li>un</li><li>deux</li></ol>"],
        ["continuation de puce indentée", "- élément\n    détail", "<ul><li>élément<br>détail</li></ul>"],
        ["continuation numérotée indentée", "1. élément\n    détail", "<ol><li>élément<br>détail</li></ol>"],
        ["reprise du numéro", "1. premier\ntexte\n2.", "<ol><li>premier</li></ol><p>texte</p><ol start=\"2\"><li></li></ol>"],
        ["cases interactives", "- [x] fait\n- [ ] à faire", '<ul class="task-list"><li><input type="checkbox" data-task-line="0" aria-label="Marquer la tâche comme terminée">fait</li><li><input type="checkbox" data-task-line="1" aria-label="Marquer la tâche comme terminée">à faire</li></ul>'],
        ["case indexée après code", "```\n- [ ] exemple\n```\n- [ ] tâche", '<pre><code>- [ ] exemple</code></pre><ul class="task-list"><li><input type="checkbox" data-task-line="3" aria-label="Marquer la tâche comme terminée">tâche</li></ul>'],
        ["code sûr", "```\n<scr" + "ipt>alert(1)</scr" + "ipt>\n```", "<pre><code>&lt;script&gt;alert(1)&lt;/script&gt;</code></pre>"],
        ["texte HTML échappé", "<scr" + "ipt>alert(1)</scr" + "ipt>", "<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>"],
        ["refus du lien javascript", "[ouvrir](javascript:alert)", "<p>ouvrir</p>"],
        ["lien HTTPS", "[site](https://example.com)", '<p><a href="https://example.com" target="_blank" rel="noopener noreferrer">site</a></p>'],
        ["tableau avec alignements et emphase", "| Nom | Valeur |\n|:---|---:|\n| **A** | 12 |", '<div class="markdown-table-wrapper"><table><thead><tr><th style="text-align: left;">Nom</th><th style="text-align: right;">Valeur</th></tr></thead><tbody><tr><td style="text-align: left;"><strong>A</strong></td><td style="text-align: right;">12</td></tr></tbody></table></div>'],
        ["image avec texte alternatif", "![schéma](images/schema.png)", '<p><img src="images/schema.png" alt="schéma" loading="lazy"></p>'],
        ["refus de l’image javascript", "![x](javascript:alert)", "<p>![x](javascript:alert)</p>"],
        ["citation sur plusieurs paragraphes", "> Première partie\n>\n> Deuxième partie", "<blockquote><p>Première partie</p><p>Deuxième partie</p></blockquote>"],
        ["lien SharePoint avec parenthèses", `[Correspondance Site Ordo-C](${sharePointUrl})`, `<p><a href="${sharePointUrl.replace(/&/g, "&amp;")}" target="_blank" rel="noopener noreferrer">Correspondance Site Ordo-C</a></p>`]
    ];

    let failures = 0;
    const results = document.getElementById("results");
    function normalizeRendered(element) {
        element.querySelectorAll(".markdown-collapse-toggle, .drag-handle").forEach(button => button.remove());
        element.querySelectorAll("[data-line], [data-end-line], [data-level]").forEach(node => {
            node.removeAttribute("data-line");
            node.removeAttribute("data-end-line");
            node.removeAttribute("data-level");
        });
        element.querySelectorAll("h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]").forEach(heading => heading.removeAttribute("id"));
        element.querySelectorAll(".markdown-section-heading, .markdown-section-content, .markdown-section").forEach(wrapper => {
            wrapper.replaceWith(...wrapper.childNodes);
        });
        return element.innerHTML;
    }
    for (const [name, input, expected] of cases) {
        const ast = MarkdownParser.parse(input);
        const rendered = document.createElement("div");
        rendered.append(MarkdownRenderer.render(ast));
        const taskStatesAreCorrect = name !== "cases interactives"
            || [...rendered.querySelectorAll("input[type='checkbox']")].map(checkbox => checkbox.checked).join(",") === "true,false";
        const passed = normalizeRendered(rendered) === expected && !JSON.stringify(ast).includes("<h1>") && taskStatesAreCorrect;
        const item = document.createElement("li");
        item.className = passed ? "pass" : "fail";
        item.textContent = `${passed ? "OK" : "ÉCHEC"} : ${name}`;
        results.append(item);
        if (!passed) failures += 1;
    }

    const collapsiblePreview = document.createElement("div");
    collapsiblePreview.className = "preview-content";
    collapsiblePreview.append(MarkdownRenderer.render(MarkdownParser.parse("# Principal\n\nContenu principal\n\n## Sous-section A\n\nContenu A\n\n## Sous-section B\n\nContenu B\n\n# Suivant\n\nContenu suivant")));
    NoteEditorView.bindHeadingCollapse(collapsiblePreview);
    document.body.append(collapsiblePreview);
    const headings = [...collapsiblePreview.querySelectorAll("h1, h2")];
    const sectionContents = [...collapsiblePreview.querySelectorAll(".markdown-section-content")];
    const addResult = (label, passed) => {
        const item = document.createElement("li");
        item.className = passed ? "pass" : "fail";
        item.textContent = `${passed ? "OK" : "ÉCHEC"} : ${label}`;
        results.append(item);
        if (!passed) failures += 1;
    };

    headings[0].previousElementSibling.click();
    addResult("le H1 replie son contenu et ses sous-sections", sectionContents[0].hidden && !sectionContents[1].hidden && !sectionContents[2].hidden);
    addResult("le H1 ne replie pas la section H1 suivante", !sectionContents[3].hidden);
    headings[0].previousElementSibling.click();
    headings[1].previousElementSibling.click();
    addResult("un H2 replie sa propre section uniquement", sectionContents[1].hidden && !sectionContents[2].hidden && !sectionContents[3].hidden);
    const firstToggle = headings[0].previousElementSibling;
    addResult("le chevron expose son état accessible", firstToggle.getAttribute("aria-expanded") === "true");
    collapsiblePreview.remove();

    const deepHeadingPreview = document.createElement("div");
    deepHeadingPreview.className = "preview-content";
    deepHeadingPreview.append(MarkdownRenderer.render(MarkdownParser.parse("# Principal\n\n## Niveau 2\n\n### Niveau 3\n\n#### Niveau 4\n\n##### Niveau 5\n\n###### Niveau 6\n\nContenu")));
    const deepHeadingLink = document.createElement("a");
    deepHeadingLink.href = "#niveau-6";
    deepHeadingLink.textContent = "Aller au niveau 6";
    deepHeadingPreview.prepend(deepHeadingLink);
    NoteEditorView.bindHeadingCollapse(deepHeadingPreview);
    document.body.append(deepHeadingPreview);
    const deepHeadingSections = [...deepHeadingPreview.querySelectorAll(".markdown-section")];
    deepHeadingPreview.querySelector("h2").previousElementSibling.click();
    deepHeadingLink.click();
    addResult("une ancre H6 déplie ses sections parentes jusqu’au contenu cible", deepHeadingPreview.querySelector("#niveau-6") !== null && deepHeadingSections.every(section => !section.querySelector(":scope > .markdown-section-content").hidden));
    deepHeadingPreview.remove();

    const resizeFixture = document.createElement("div");
    const resizeHome = document.createElement("div");
    const resizeHeader = document.createElement("header");
    const resizeView = document.createElement("section");
    resizeView.hidden = true;
    const resizeEditor = document.createElement("textarea");
    resizeEditor.style.cssText = "width:400px;box-sizing:border-box;border:0;overflow:hidden;line-height:20px;padding:8px";
    resizeEditor.value = Array.from({ length: 100 }, (_, index) => `ligne ${index}`).join("\n");
    resizeView.append(resizeEditor);
    const resizeToggle = document.createElement("button");
    resizeToggle.innerHTML = '<span aria-hidden="true"></span><span class="preview-toggle-label"></span>';
    resizeFixture.append(resizeHome, resizeHeader, resizeView, resizeToggle);
    document.body.append(resizeFixture);
    NoteEditorView.resizeEditor(resizeEditor);
    const didNotMeasureWhileHidden = resizeEditor.style.height === "";
    NoteEditorView.showEditor({ home: resizeHome, editorView: resizeView, header: resizeHeader, editor: resizeEditor, previewToggle: resizeToggle });
    addResult("redimensionne l’éditeur après l’avoir rendu visible", didNotMeasureWhileHidden && resizeEditor.clientHeight > 1000 && resizeEditor.scrollHeight <= resizeEditor.clientHeight);
    resizeFixture.remove();

    const tocPreview = document.createElement("div");
    tocPreview.className = "preview-content";
    const tocHeadings = [
        ["Texte et typographie — H2", "texte-et-typographie--h2"],
        ["Listes", "listes"],
        ["Liens et images", "liens-et-images"],
        ["Citations", "citations"],
        ["Code", "code"],
        ["Tableaux — GFM", "tableaux--gfm"],
        ["Extensions courantes", "extensions-courantes"],
        ["HTML intégré", "html-intégré"],
        ["Cas limites", "cas-limites"]
    ];
    const tocMarkdown = `${tocHeadings.map(([title, slug]) => `[${title}](#${slug})`).join(" | ")}\n\n# Rubriques\n\n${tocHeadings.map(([title]) => `## ${title}\n\nContenu`).join("\n\n")}`;
    const tocHeader = document.createElement("header");
    tocHeader.style.height = "64px";
    document.body.prepend(tocHeader);
    tocPreview.append(MarkdownRenderer.render(MarkdownParser.parse(tocMarkdown)));
    NoteEditorView.bindHeadingCollapse(tocPreview);
    document.body.append(tocPreview);
    const tocLinks = [...tocPreview.querySelectorAll("a[href^='#']")];
    const tocRoot = tocPreview.querySelector(".markdown-section");
    tocRoot.querySelector(":scope > .markdown-section-heading > .markdown-collapse-toggle").click();
    tocLinks[7].click();
    addResult("les neuf liens du sommaire correspondent aux ancres des titres", tocHeadings.every(([, slug]) => tocPreview.querySelector(`h1[id='${slug}'], h2[id='${slug}'], h3[id='${slug}'], h4[id='${slug}'], h5[id='${slug}'], h6[id='${slug}']`)));
    addResult("un lien interne déplie sa section et ajoute l’espace final nécessaire sous l’en-tête sticky", !tocRoot.querySelector(":scope > .markdown-section-content").hidden && !tocLinks[7].hasAttribute("target") && tocPreview.querySelector("#html-intégré").style.scrollMarginTop === "76px" && Number.parseFloat(tocPreview.querySelector(":scope > .markdown-anchor-spacer")?.style.height) > 0 && decodeURIComponent(window.location.hash.slice(1)) === "html-intégré");
    tocPreview.remove();
    tocHeader.remove();

    const dndAst = MarkdownParser.parse("# A\n\n- un\n  détail\n- deux\n\n## B\n\n1. n\n\n# C");
    const dndList = dndAst.blocks.find(block => block.type === "list");
    addResult("le parser expose les plages de lignes", dndList.items[0].line === 2 && dndList.items[0].endLine === 3 && dndAst.blocks[0].endLine === 9);
    const moveItem = NotePreviewDnd.moveListItem("- un\n  détail\n- deux", { start: 0, end: 1 }, { line: 2, endLine: 2, position: "after" });
    addResult("déplace une puce avec sa continuation", moveItem?.text === "- deux\n- un\n  détail" && moveItem.line === 1);
    const moveTask = NotePreviewDnd.moveListItem("- [x] fait\n\n1. un", { start: 0, end: 0 }, { line: 2, endLine: 2, position: "after" });
    addResult("adapte le marqueur à la liste cible", moveTask?.text === "\n1. un\n1. fait");
    addResult("refuse de déposer un élément sur lui-même", NotePreviewDnd.moveListItem("- a\n- b", { start: 0, end: 0 }, { line: 1, endLine: 1, position: "before" }) === null);
    const moveSection = NotePreviewDnd.moveSection("# A\ntexte\n\n## B\nsous\n\n# C\nfin", { start: 0, end: 5, level: 1 }, { line: 6, endLine: 7, level: 1, position: "after" });
    addResult("déplace un titre avec toute sa section", moveSection?.text === "# C\nfin\n\n# A\ntexte\n\n## B\nsous");
    const nested = NotePreviewDnd.moveSection("# A\n\n# B\nx", { start: 2, end: 3, level: 1 }, { line: 0, endLine: 1, level: 1, position: "before" });
    addResult("remonte une section au-dessus d’une autre", nested?.text.startsWith("# B\nx\n\n# A"));
    addResult("refuse de déposer une section dans elle-même", NotePreviewDnd.moveSection("# A\n## B", { start: 0, end: 1, level: 1 }, { line: 1, endLine: 1, level: 2, position: "after" }) === null);

    async function loadStyles() {
        const names = ["tokens", "base", "editor", "preview", "responsive"];
        const links = await Promise.all(names.map(name => new Promise((resolve, reject) => {
            const link = document.createElement("link");
            link.rel = "stylesheet";
            link.href = `../css/${name}.css`;
            link.onload = () => resolve(link);
            link.onerror = () => reject(new Error(`${name}.css`));
            document.head.append(link);
        })));
        try {
            const rulesOf = link => [...link.sheet.cssRules];
            const isPrint = rule => rule instanceof CSSMediaRule && rule.media.mediaText === "print";
            const responsive = rulesOf(links[4]);
            const base = links.slice(0, 4).flatMap(rulesOf).map(rule => rule.cssText).join("\n");
            const screen = `${base}\n${responsive.filter(rule => !isPrint(rule)).map(rule => rule.cssText).join("\n")}`;
            // Le bloc print est placé en dernier, comme dans responsive.css.
            const print = `${screen}\n${responsive.filter(isPrint).flatMap(rule => [...rule.cssRules]).map(rule => rule.cssText).join("\n")}`;
            return { screen, print };
        } finally {
            links.forEach(link => link.remove());
        }
    }

    // Iframe de 700px : plus étroite que 768px, comme une page A4 imprimée.
    function displaysIn(css, viewClass) {
        const frame = document.createElement("iframe");
        frame.style.cssText = "position:absolute;left:-9999px;width:700px;height:600px";
        document.body.append(frame);
        const doc = frame.contentDocument;
        doc.open();
        doc.write(`<style>${css}</style><header id="h"></header><main><section class="editor-view ${viewClass}"><div class="container"><section class="panel editor-panel" id="e"><h2>Éditeur</h2></section><section class="panel preview-panel" id="p"><h2 id="t">Aperçu</h2><div class="preview-content"><h2 id="c">Sous-titre</h2>Texte</div></section></div></section></main>`);
        doc.close();
        const display = id => frame.contentWindow.getComputedStyle(doc.getElementById(id)).display;
        const result = { header: display("h"), editor: display("e"), preview: display("p"), panelTitle: display("t"), contentHeading: display("c") };
        frame.remove();
        return result;
    }

    function measuresEditorPanels(css) {
        const frame = document.createElement("iframe");
        frame.style.cssText = "position:absolute;left:-9999px;width:1280px;height:800px";
        document.body.append(frame);
        const doc = frame.contentDocument;
        doc.open();
        const longPreview = Array.from({ length: 60 }, (_, index) => `<p>Paragraphe ${index} avec assez de texte pour remplir plusieurs lignes dans l’aperçu.</p>`).join("");
        doc.write(`<!DOCTYPE html><html><head><style>${css}</style></head><body><header>Bloc-notes Markdown</header><main><section id="editorView" class="editor-view"><div class="container"><section class="panel editor-panel" id="editorPanel"><h2>Éditeur</h2><textarea id="editor"></textarea></section><section class="panel preview-panel" id="previewPanel"><h2>Aperçu</h2><div class="preview-content"><h1>Titre</h1>${longPreview}</div></section></div></section></main></body></html>`);
        doc.close();
        const editor = doc.getElementById("editor");
        editor.value = Array.from({ length: 100 }, (_, index) => `Ligne de texte ${index}`).join("\n");
        NoteEditorView.resizeEditor(editor);
        const editorHeight = doc.getElementById("editorPanel").getBoundingClientRect().height;
        const previewHeight = doc.getElementById("previewPanel").getBoundingClientRect().height;
        const pageScrolls = doc.documentElement.scrollHeight > 800;
        const previewFitsContent = doc.defaultView.getComputedStyle(doc.querySelector(".preview-content")).overflowY === "visible";
        const editorFitsContent = editor.scrollHeight <= editor.clientHeight && doc.defaultView.getComputedStyle(editor).overflowY === "hidden";
        frame.remove();
        return { editorHeight, previewHeight, pageScrolls, previewFitsContent, editorFitsContent };
    }

    async function runLayoutTests() {
        let styles;
        try { styles = await loadStyles(); }
        catch (error) {
            addResult(`mise en page et impression ignorées (CSS illisible : ${error.message}; servir le projet en HTTP)`, true);
            return;
        }
        const narrow = displaysIn(styles.screen, "");
        const editorPanels = measuresEditorPanels(styles.screen);
        addResult("les panneaux grandissent avec leur contenu et seule la page défile", editorPanels.editorHeight > 0 && editorPanels.editorHeight === editorPanels.previewHeight && editorPanels.pageScrolls && editorPanels.previewFitsContent && editorPanels.editorFitsContent);
        const taskFrame = document.createElement("iframe");
        document.body.append(taskFrame);
        const taskDoc = taskFrame.contentDocument;
        taskDoc.open();
        taskDoc.write(`<style>${styles.screen}</style><div class="preview-content"><ul class="task-list"><li id="done"><input type="checkbox" checked>fait</li><li id="todo"><input type="checkbox">à faire</li></ul></div>`);
        taskDoc.close();
        const lineOf = id => taskFrame.contentWindow.getComputedStyle(taskDoc.getElementById(id)).textDecorationLine;
        addResult("une case cochée raye son texte, pas une case vide", lineOf("done") === "line-through" && lineOf("todo") === "none");
        taskDoc.getElementById("done").firstElementChild.checked = false;
        addResult("décocher la case retire la rayure", lineOf("done") === "none");
        taskFrame.remove();

        const colorsFor = theme => {
            const frame = document.createElement("iframe");
            document.body.append(frame);
            const doc = frame.contentDocument;
            doc.open();
            doc.write(`<!DOCTYPE html><html data-theme="${theme}"><head><style>${styles.screen}</style></head><body><header id="h"></header><button class="btn btn-secondary" id="b">x</button><div class="folder-item drag-target-active"><div class="folder-row" id="folderDrop"></div></div><button class="btn btn-danger" id="danger">Supprimer</button><dialog id="dialog"></dialog><div class="preview-content"><blockquote id="quote"></blockquote><code id="code">x</code><div class="markdown-table-wrapper"><table><thead><tr><th id="tableHeader">Titre</th></tr></thead></table></div></div></body></html>`);
            doc.close();
            const view = frame.contentWindow;
            const colorOf = id => view.getComputedStyle(doc.getElementById(id)).backgroundColor;
            const result = {
                page: view.getComputedStyle(doc.body).backgroundColor,
                text: view.getComputedStyle(doc.body).color,
                header: colorOf("h"),
                folderDrop: colorOf("folderDrop"),
                dangerButton: colorOf("danger"),
                dialog: colorOf("dialog"),
                quote: colorOf("quote"),
                code: colorOf("code"),
                tableHeader: colorOf("tableHeader")
            };
            frame.remove();
            return result;
        };
        const light = colorsFor("light");
        const dark = colorsFor("dark");
        addResult("le thème sombre change fond, texte et en-tête", dark.page !== light.page && dark.text !== light.text && dark.header !== light.header);
        addResult("le thème sombre a un fond sombre et un texte clair", dark.page === "rgb(26, 26, 26)" && dark.text === "rgb(230, 230, 230)");
        addResult("le dialogue et le bouton de suppression suivent le thème", dark.dialog !== light.dialog && dark.dangerButton !== light.dangerButton);
        addResult("les zones de dépôt suivent le thème", dark.folderDrop !== light.folderDrop);
        addResult("les citations suivent le thème", dark.quote !== light.quote);
        addResult("les en-têtes de tableau suivent le thème", dark.tableHeader !== light.tableHeader);
        addResult("le code inline suit le thème", dark.code !== light.code);

        const previousTheme = document.documentElement.dataset.theme;
        NoteTheme.apply("dark");
        const applied = document.documentElement.dataset.theme === "dark";
        NoteTheme.apply("light");
        addResult("NoteTheme applique le thème demandé", applied && document.documentElement.dataset.theme === "light");
        if (previousTheme) document.documentElement.dataset.theme = previousTheme;
        addResult("écran étroit : seul l’éditeur est visible", narrow.editor !== "none" && narrow.preview === "none");
        const narrowPreview = displaysIn(styles.screen, "preview-only");
        addResult("écran étroit : le mode aperçu seul affiche l’aperçu", narrowPreview.editor === "none" && narrowPreview.preview !== "none");
        const printed = displaysIn(styles.print, "");
        addResult("impression sur page étroite : l’aperçu est affiché", printed.preview !== "none");
        addResult("impression : l’éditeur et l’en-tête sont masqués", printed.editor === "none" && printed.header === "none");
        addResult("impression : les sous-titres H2 sont affichés, pas le titre du panneau", printed.contentHeading !== "none" && printed.panelTitle === "none");
        const printedPreviewOnly = displaysIn(styles.print, "preview-only");
        addResult("impression en aperçu seul : l’aperçu est affiché", printedPreviewOnly.preview !== "none");
    }

    runLayoutTests().finally(() => {
        const totalTests = results.children.length;
        document.getElementById("summary").textContent = `${totalTests - failures}/${totalTests} tests réussis`;
        document.getElementById("summary").className = failures ? "fail" : "pass";
    });
})();