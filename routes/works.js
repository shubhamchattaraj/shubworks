const express = require("express");
const fs = require("fs");
const path = require("path");
const router = express.Router();
const pool = require("../db/database");

const CONTENT_ROOT = path.resolve(__dirname, "..", "content");
const ALLOWED_TYPES = new Set(["poem", "fable", "story", "novel", "work"]);
const SORTS = {
    newest: "w.created_at DESC, w.id DESC",
    updated: "w.updated_at DESC, w.id DESC",
    title: "w.title ASC, w.id ASC",
    longest: "w.word_count DESC, w.id DESC",
    shortest: "w.word_count ASC, w.id ASC"
};

function parsePositiveInt(value, fallback, max) {
    const number = Number.parseInt(value, 10);
    if (!Number.isFinite(number) || number < 1) return fallback;
    return Math.min(number, max);
}

function resolveContentPath(relativePath) {
    if (!relativePath) return null;

    const resolved = path.resolve(CONTENT_ROOT, relativePath.replace(/^content[\\/]/i, ""));
    const relative = path.relative(CONTENT_ROOT, resolved);

    if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
    return resolved;
}

async function getTags(workIds) {
    if (!workIds.length) return new Map();

    const result = await pool.query(
        `SELECT wt.work_id, t.name
         FROM work_tags wt
         JOIN tags t ON t.id = wt.tag_id
         WHERE wt.work_id = ANY($1::int[])
         ORDER BY t.name`,
        [workIds]
    );

    const tags = new Map();
    for (const row of result.rows) {
        if (!tags.has(row.work_id)) tags.set(row.work_id, []);
        tags.get(row.work_id).push(row.name);
    }
    return tags;
}

function publicWork(row, tags = []) {
    return {
        id: row.id,
        source_id: row.source_id,
        title: row.title,
        slug: row.slug,
        type: row.type,
        cover: row.cover,
        universe: row.universe,
        description: row.description,
        word_count: row.word_count,
        reading_time: row.reading_time,
        published: row.published,
        created_at: row.created_at,
        updated_at: row.updated_at,
        tags
    };
}

// GET /api/works
// Lightweight, paginated collection endpoint. Content is deliberately excluded.
router.get("/", async (req, res) => {
    try {
        const page = parsePositiveInt(req.query.page, 1, 1000000);
        const limit = parsePositiveInt(req.query.limit, 36, 100);
        const offset = (page - 1) * limit;

        const type = String(req.query.type || "").toLowerCase().trim();
        const universe = String(req.query.universe || "").trim();
        const tag = String(req.query.tag || "").trim();
        const search = String(req.query.search || "").trim();
        const sortKey = String(req.query.sort || "newest").toLowerCase();

        if (type && !ALLOWED_TYPES.has(type)) {
            return res.status(400).json({ success: false, message: "Invalid work type" });
        }

        const sort = SORTS[sortKey] || SORTS.newest;
        const where = ["w.published = TRUE"];
        const params = [];

        if (type) {
            params.push(type);
            where.push(`w.type = $${params.length}`);
        }

        if (universe) {
            params.push(universe);
            where.push(`w.universe = $${params.length}`);
        }

        if (tag) {
            params.push(tag);
            where.push(`EXISTS (
                SELECT 1 FROM work_tags wt2
                JOIN tags t2 ON t2.id = wt2.tag_id
                WHERE wt2.work_id = w.id AND LOWER(t2.name) = LOWER($${params.length})
            )`);
        }

        if (search) {
            params.push(`%${search}%`);
            where.push(`(w.title ILIKE $${params.length} OR w.universe ILIKE $${params.length})`);
        }

        const whereSql = where.join(" AND ");

        const countResult = await pool.query(
            `SELECT COUNT(*)::int AS total FROM works w WHERE ${whereSql}`,
            params
        );

        params.push(limit, offset);
        const result = await pool.query(
            `SELECT w.id, w.source_id, w.title, w.slug, w.type, w.cover,
                    w.universe, w.description, w.word_count, w.reading_time,
                    w.published, w.created_at, w.updated_at
             FROM works w
             WHERE ${whereSql}
             ORDER BY ${sort}
             LIMIT $${params.length - 1} OFFSET $${params.length}`,
            params
        );

        const tagMap = await getTags(result.rows.map(row => row.id));
        const total = countResult.rows[0].total;
        const totalPages = Math.max(1, Math.ceil(total / limit));

        res.json({
            success: true,
            data: result.rows.map(row => publicWork(row, tagMap.get(row.id) || [])),
            pagination: {
                page,
                limit,
                total,
                totalPages,
                hasNextPage: page < totalPages,
                hasPreviousPage: page > 1
            }
        });
    } catch (error) {
        console.error("Error fetching works:", error);
        res.status(500).json({ success: false, message: "Failed to fetch works" });
    }
});

// Backwards-compatible type route, now paginated.
router.get("/type/:type", (req, res) => {
    const query = new URLSearchParams({
        type: req.params.type,
        page: String(req.query.page || 1),
        limit: String(req.query.limit || 36)
    });
    return res.redirect(307, `/api/works?${query.toString()}`);
});

// GET /api/works/slug/:slug
// Content is read only when one work is requested.
router.get("/slug/:slug", async (req, res) => {
    try {
        const { slug } = req.params;

        const workResult = await pool.query(
            `SELECT id, source_id, title, slug, type, cover, universe, description,
                    content, content_path, word_count, reading_time, published,
                    created_at, updated_at
             FROM works
             WHERE slug = $1 AND published = TRUE
             LIMIT 1`,
            [slug]
        );

        if (!workResult.rowCount) {
            return res.status(404).json({ success: false, message: "Work not found" });
        }

        const work = workResult.rows[0];
        let content = work.content || "";

        if (work.content_path) {
            const filePath = resolveContentPath(work.content_path);
            if (filePath && fs.existsSync(filePath)) {
                content = fs.readFileSync(filePath, "utf8");
            }
        }

        const tagMap = await getTags([work.id]);

        res.json({
            success: true,
            data: {
                ...publicWork(work, tagMap.get(work.id) || []),
                content
            }
        });
    } catch (error) {
        console.error("Error fetching work:", error);
        res.status(500).json({ success: false, message: "Failed to fetch work" });
    }
});

module.exports = router;
