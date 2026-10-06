(() => {
    function download(fileName, content, mimeType) {
        const blobUrl = URL.createObjectURL(new Blob([content], { type: mimeType }));
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = fileName;
        document.body.append(link);
        link.click();
        link.remove();
        window.setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
    }

    window.NoteFiles = { download };
})();