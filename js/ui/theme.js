(() => {
    const storageKey = "bloc-notes-theme";
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)");

    function stored() {
        try {
            const value = localStorage.getItem(storageKey);
            return value === "dark" || value === "light" ? value : null;
        } catch {
            return null;
        }
    }

    function current() {
        return stored() || (systemDark.matches ? "dark" : "light");
    }

    function updateButton(theme) {
        const button = document.getElementById("btnToggleTheme");
        if (!button) return;
        const dark = theme === "dark";
        button.setAttribute("aria-pressed", String(dark));
        button.title = dark ? "Revenir au thème clair" : "Activer le thème sombre";
        button.querySelector("[aria-hidden='true']").textContent = dark ? "☀️" : "🌙";
    }

    function apply(theme) {
        document.documentElement.dataset.theme = theme;
        updateButton(theme);
    }

    function toggle() {
        const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        try { localStorage.setItem(storageKey, next); } catch { /* préférence non conservée */ }
        apply(next);
    }

    // Appliqué dès le chargement du script (dans le head) pour éviter un flash clair.
    apply(current());
    systemDark.addEventListener("change", () => { if (!stored()) apply(current()); });
    document.addEventListener("DOMContentLoaded", () => {
        updateButton(document.documentElement.dataset.theme);
        document.getElementById("btnToggleTheme")?.addEventListener("click", toggle);
    });

    window.NoteTheme = { apply, current, toggle };
})();
