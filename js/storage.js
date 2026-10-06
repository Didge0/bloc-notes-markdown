(() => {
    const storageKey = "blocNotes";

    function load() {
        try {
            const value = localStorage.getItem(storageKey);
            if (!value) return null;
            const parsed = JSON.parse(value);
            if (!parsed || typeof parsed !== "object") return null;
            return {
                content: typeof parsed.content === "string" ? parsed.content : "",
                fileName: typeof parsed.fileName === "string" ? parsed.fileName : "Ma note"
            };
        } catch {
            return null;
        }
    }

    function save(note) {
        try {
            localStorage.setItem(storageKey, JSON.stringify(note));
            return true;
        } catch {
            return false;
        }
    }

    window.NoteStorage = { load, save };
})();