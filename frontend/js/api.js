(function (window) {
    "use strict";

    async function request(url, options = {}) {
        const response = await fetch(url, {
            cache: "no-store",
            ...options,
            headers: {
                Accept: "application/json",
                ...(options.headers || {})
            }
        });

        let payload = null;
        try {
            payload = await response.json();
        } catch (_) {
            payload = null;
        }

        if (!response.ok || payload?.success === false) {
            throw new Error(payload?.message || `Request failed (${response.status})`);
        }

        return payload;
    }

    window.SHUBWORKS_API = Object.freeze({
        async getWorks(params = {}) {
            const query = new URLSearchParams();
            for (const [key, value] of Object.entries(params)) {
                if (value !== undefined && value !== null && value !== "") {
                    query.set(key, value);
                }
            }
            const suffix = query.toString() ? `?${query}` : "";
            return request(`/api/works${suffix}`);
        },

        async getWork(slug) {
            const payload = await request(`/api/works/slug/${encodeURIComponent(slug)}`);
            return payload.data;
        },

        async getStats() {
            return request("/api/stats");
        }
    });
})(window);
