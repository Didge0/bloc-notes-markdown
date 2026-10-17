(() => {
    // Adaptateur qui imite les handles de l'API File System Access au-dessus de l'API HTTP du serveur.
    function createClient({ baseUrl, token }) {
        const root = baseUrl.replace(/\/+$/, "");

        async function request(route, path, options = {}) {
            const { params = {}, ...init } = options;
            const query = new URLSearchParams({ path, ...params });
            const headers = { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers };
            let response;
            try { response = await fetch(`${root}/api/${route}?${query}`, { ...init, headers }); }
            catch { throw new Error("Serveur injoignable. Vérifiez l’adresse et que le serveur est lancé."); }
            if (response.ok) return response;
            let message = "";
            try { message = (await response.json()).error; } catch { /* corps non JSON */ }
            if (response.status === 404) throw new DOMException(message || "Introuvable", "NotFoundError");
            if (response.status === 401) throw new DOMException(message || "Authentification requise", "NotAllowedError");
            throw new Error(message || `Erreur serveur (${response.status})`);
        }

        const join = (parent, name) => parent ? `${parent}/${name}` : name;
        const stat = async path => {
            try { return await (await request("stat", path)).json(); }
            catch (error) { if (error.name === "NotFoundError") return null; throw error; }
        };

        class RemoteFileHandle {
            constructor(path) { this.kind = "file"; this.path = path; this.name = path.split("/").pop(); this.remote = true; }
            async getFile() {
                const response = await request("file", this.path);
                const text = await response.text();
                return { name: this.name, lastModified: Number(response.headers.get("X-Modified")) || 0, text: async () => text };
            }
            async createWritable() {
                let content = "";
                return {
                    write: async data => { content += data; },
                    close: async () => { await request("file", this.path, { method: "PUT", body: content, headers: { "Content-Type": "text/plain; charset=utf-8" } }); },
                    abort: async () => { content = ""; }
                };
            }
            async isSameEntry(other) { return other?.remote && other.kind === "file" && other.path === this.path; }
        }

        class RemoteDirectoryHandle {
            constructor(path, name) { this.kind = "directory"; this.path = path; this.name = name || path.split("/").pop(); this.remote = true; }
            async *values() {
                const entries = await (await request("list", this.path)).json();
                for (const entry of entries) {
                    const path = join(this.path, entry.name);
                    yield entry.kind === "directory" ? new RemoteDirectoryHandle(path) : new RemoteFileHandle(path);
                }
            }
            async getFileHandle(name, { create = false } = {}) {
                const path = join(this.path, name);
                const info = await stat(path);
                if (info?.kind === "directory") throw new DOMException("Ce nom désigne un dossier", "TypeMismatchError");
                if (!info) {
                    if (!create) throw new DOMException("Fichier introuvable", "NotFoundError");
                    await request("file", path, { method: "PUT", body: "" });
                }
                return new RemoteFileHandle(path);
            }
            async getDirectoryHandle(name, { create = false } = {}) {
                const path = join(this.path, name);
                const info = await stat(path);
                if (info?.kind === "file") throw new DOMException("Ce nom désigne un fichier", "TypeMismatchError");
                if (!info) {
                    if (!create) throw new DOMException("Dossier introuvable", "NotFoundError");
                    await request("dir", path, { method: "POST" });
                }
                return new RemoteDirectoryHandle(path);
            }
            async removeEntry(name, { recursive = false } = {}) {
                await request("entry", join(this.path, name), { method: "DELETE", params: recursive ? { recursive: "1" } : {} });
            }
            async isSameEntry(other) { return other?.remote && other.kind === "directory" && other.baseUrl === root && other.path === this.path; }
            async queryPermission() { return "granted"; }
            async requestPermission() { return "granted"; }
            async loadOrder() { return await (await request("order", this.path)).json(); }
            async saveOrder(names) { await request("order", this.path, { method: "PUT", body: JSON.stringify(names) }); }
        }

        RemoteDirectoryHandle.prototype.baseUrl = root;
        return { root: new RemoteDirectoryHandle("", "Serveur"), baseUrl: root, check: () => request("list", "") };
    }

    window.RemoteBackend = { connect: async options => { const client = createClient(options); await client.check(); return client; } };
})();
