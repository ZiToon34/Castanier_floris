exports.handler = async function handler(event) {
    const pageId = process.env.FB_PAGE_ID;
    const accessToken = process.env.FB_PAGE_ACCESS_TOKEN;
    const apiVersion = process.env.FB_API_VERSION || "v23.0";

    if (!pageId || !accessToken) {
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify({
                error: "Missing Facebook configuration. Set FB_PAGE_ID and FB_PAGE_ACCESS_TOKEN."
            })
        };
    }

    const limitParam = Number.parseInt(event.queryStringParameters?.limit || "12", 10);
    const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(limitParam, 30)) : 12;

    const endpoint = new URL(`https://graph.facebook.com/${apiVersion}/${encodeURIComponent(pageId)}/photos`);
    endpoint.searchParams.set("type", "uploaded");
    endpoint.searchParams.set("fields", "id,images,permalink_url,created_time,name");
    endpoint.searchParams.set("limit", String(limit));
    endpoint.searchParams.set("access_token", accessToken);

    try {
        const response = await fetch(endpoint.toString());
        const payload = await response.json();

        if (!response.ok || payload.error) {
            const details = payload?.error?.message || "Unknown Facebook API error";
            return {
                statusCode: 502,
                headers: { "Content-Type": "application/json; charset=utf-8" },
                body: JSON.stringify({ error: details })
            };
        }

        const data = (payload.data || []).map((photo) => {
            const imageUrl = Array.isArray(photo.images) && photo.images.length ? photo.images[0].source : null;
            const createdAt = photo.created_time
                ? new Date(photo.created_time).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" })
                : null;

            return {
                id: photo.id,
                imageUrl,
                permalink: photo.permalink_url || null,
                caption: photo.name || null,
                createdAt
            };
        }).filter((photo) => Boolean(photo.imageUrl));

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "public, max-age=300"
            },
            body: JSON.stringify({ data })
        };
    } catch (error) {
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json; charset=utf-8" },
            body: JSON.stringify({
                error: "Failed to fetch Facebook photos."
            })
        };
    }
};
