(() => {
    const sharePointUrl = "https://sncf.sharepoint.com/:x:/r/sites/TELEDIAG_SPDC/Documents%20partages/Affaires/ORDO_ordo%20correctif%20(SC-2019-00425)/02%20-%20Documentation%20donn%C3%A9es%20entr%C3%A9e%20et%20process/04%20-%20Donnees%20STF%20pour%20utilisation%20OrdoC/Correspondance%20Site%20Ordo%20C.xlsx?d=w745aa0f3f00a4bb39bfad35f31539f0b&csf=1&web=1&e=bgplHq";
    const cases = [
        ["contenu vide", "", ""],
        ["titres", "# Titre\n\n## Sous-titre\n### Niveau 3", "<h1>Titre</h1><h2>Sous-titre</h2><h3>Niveau 3</h3>"],
        ["emphase et code", "**fort** *fin* `x < y`", "<p><strong>fort</strong> <em>fin</em> <code>x &lt; y</code></p>"],
        ["retours à la ligne", "Prévu demain.\nEffectué demain.", "<p>Prévu demain.<br>Effectué demain.</p>"],
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
        ["lien SharePoint avec parenthèses", `[Correspondance Site Ordo-C](${sharePointUrl})`, `<p><a href="${sharePointUrl.replace(/&/g, "&amp;")}" target="_blank" rel="noopener noreferrer">Correspondance Site Ordo-C</a></p>`]
    ];

    let failures = 0;
    const results = document.getElementById("results");
    for (const [name, input, expected] of cases) {
        const ast = MarkdownParser.parse(input);
        const rendered = document.createElement("div");
        rendered.append(MarkdownRenderer.render(ast));
        const taskStatesAreCorrect = name !== "cases interactives"
            || [...rendered.querySelectorAll("input[type='checkbox']")].map(checkbox => checkbox.checked).join(",") === "true,false";
        const passed = rendered.innerHTML === expected && !JSON.stringify(ast).includes("<h1>") && taskStatesAreCorrect;
        const item = document.createElement("li");
        item.className = passed ? "pass" : "fail";
        item.textContent = `${passed ? "OK" : "ÉCHEC"} : ${name}`;
        results.append(item);
        if (!passed) failures += 1;
    }
    document.getElementById("summary").textContent = `${cases.length - failures}/${cases.length} tests réussis`;
    document.getElementById("summary").className = failures ? "fail" : "pass";
})();