(() => {
    const editor = document.getElementById("editor");
    const preview = document.getElementById("preview");
    const fileNameInput = document.getElementById("fileName");
    const wordCount = document.getElementById("wordCount");
    const statusBar = document.getElementById("statusBar");
    const fileInput = document.getElementById("hiddenFileInput");
    let saveTimeout;
    let statusTimeout;

    function showStatus(message) {
        window.clearTimeout(statusTimeout);
        statusBar.textContent = message;
        statusTimeout = window.setTimeout(() => { statusBar.textContent = ""; }, 3000);
    }

    function saveNote(showConfirmation = true) {
        const saved = NoteStorage.save({ content: editor.value, fileName: fileNameInput.value });
        if (showConfirmation) showStatus(saved ? "Enregistré localement" : "Impossible d’enregistrer cette note");
        return saved;
    }

    function scheduleAutoSave() {
        window.clearTimeout(saveTimeout);
        saveTimeout = window.setTimeout(() => saveNote(), 500);
    }

    function renderPreview(shouldScheduleSave = true) {
        preview.innerHTML = MarkdownRenderer.render(editor.value);
        const words = editor.value.trim().split(/\s+/u).filter(Boolean).length;
        wordCount.textContent = `Mots : ${words}`;
        if (shouldScheduleSave) scheduleAutoSave();
    }

    function downloadMarkdown() {
        const name = fileNameInput.value.trim() || "note";
        NoteFiles.download(`${name}.md`, editor.value, "text/markdown;charset=utf-8");
        showStatus("Fichier Markdown téléchargé");
    }

    function downloadHtml() {
        const name = fileNameInput.value.trim() || "note";
        const title = MarkdownRenderer.escapeHtml(name);
        const html = `<!DOCTYPE html>
<html lang="fr">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { max-width: 900px; margin: 2rem auto; padding: 0 1.5rem; color: #333; font: 16px/1.6 sans-serif; }
        h1, h2, h3 { color: #8b3a3a; }
        pre { overflow-x: auto; padding: 1rem; background: #f5f5f5; }
        code { padding: .15rem .3rem; background: #f0e5e5; }
        pre code { padding: 0; background: transparent; }
        blockquote { border-left: 4px solid #8b3a3a; padding-left: 1rem; color: #666; }
        .task-list { list-style: none; padding-left: 0; }
        a { color: #8b3a3a; }
    </style>
</head>
<body>
    <h1>${title}</h1>
    ${preview.innerHTML}
</body>
</html>`;
        NoteFiles.download(`${name}.html`, html, "text/html;charset=utf-8");
        showStatus("Fichier HTML téléchargé");
    }

    editor.addEventListener("input", () => renderPreview());
    fileNameInput.addEventListener("input", scheduleAutoSave);

    document.getElementById("btnNewNote").addEventListener("click", () => {
        if (editor.value.trim() && !window.confirm("Créer une nouvelle note ? Le contenu actuel sera remplacé.")) return;
        editor.value = "";
        fileNameInput.value = "Ma note";
        renderPreview(false);
        const saved = saveNote(false);
        if (!saved) {
            showStatus("Impossible d’enregistrer cette note");
            return;
        }
        showStatus("Nouvelle note créée");
    });

    document.getElementById("btnOpenFile").addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", async () => {
        const file = fileInput.files[0];
        if (!file) return;
        try {
            editor.value = await file.text();
            fileNameInput.value = file.name.replace(/\.(md|markdown|txt)$/i, "");
            renderPreview(false);
            showStatus(saveNote(false) ? "Fichier importé" : "Fichier importé, mais la sauvegarde a échoué");
        } catch {
            showStatus("Impossible de lire ce fichier");
        } finally {
            fileInput.value = "";
        }
    });

    document.getElementById("btnDownloadMd").addEventListener("click", downloadMarkdown);
    document.getElementById("btnDownloadHtml").addEventListener("click", downloadHtml);
    document.getElementById("btnPrint").addEventListener("click", () => window.print());

    const savedNote = NoteStorage.load();
    editor.value = savedNote?.content ?? "# Bienvenue !\n\nBienvenue dans votre bloc-notes Markdown local.\n\n## Fonctionnalités\n\n- Titres avec #, ## et ###\n- **Gras** et *italique*\n- Listes à puces, numérotées et tâches";
    fileNameInput.value = savedNote?.fileName || "Ma note";
    preview.innerHTML = MarkdownRenderer.render(editor.value);
    wordCount.textContent = `Mots : ${editor.value.trim().split(/\s+/u).filter(Boolean).length}`;
})();