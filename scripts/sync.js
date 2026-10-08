const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const pool = require("../db/database");

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const CONTENT_DIR = path.join(ROOT, "content");
const SCHEMA_FILE = path.join(ROOT, "database", "schema.sql");

const SOURCE_FILES = {
    works: path.join(DATA_DIR, "data.json"),
    novels: path.join(DATA_DIR, "novels.json"),
    series: path.join(DATA_DIR, "series.json")
};

function slugify(text) {
    return String(text || "")
        .toLowerCase()
        .trim()
        .replace(/[’'\"]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function sha256(value) {
    return crypto.createHash("sha256").update(value).digest("hex");
}

function readJson(filePath, required = true) {
    if (!fs.existsSync(filePath)) {
        if (required) throw new Error(`Missing source file: ${filePath}`);
        return [];
    }

    try {
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch (error) {
        throw new Error(`Invalid JSON in ${filePath}: ${error.message}`);
    }
}

function validateMetadata(items, sourceName) {
    if (!Array.isArray(items)) {
        throw new Error(`${sourceName} must contain a JSON array.`);
    }

    const seen = new Set();
    for (const item of items) {
        if (!item || !item.id || !item.title) {
            throw new Error(`${sourceName}: every item needs id and title.`);
        }
        if (seen.has(item.id)) {
            throw new Error(`${sourceName}: duplicate id ${item.id}.`);
        }
        seen.add(item.id);
    }
}

function getType(sourceId) {
    const prefix = String(sourceId).match(/^[A-Za-z]+/)?.[0]?.toUpperCase();
    return { P: "poem", B: "fable", S: "story", N: "novel" }[prefix] || "work";
}

function getMarkdownFiles(dir) {
    const files = [];
    if (!fs.existsSync(dir)) return files;

    const stack = [dir];
    while (stack.length) {
        const current = stack.pop();
        for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) stack.push(fullPath);
            else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) files.push(fullPath);
        }
    }

    return files.sort((a, b) => a.localeCompare(b));
}

function getSourceId(filePath) {
    const filename = path.basename(filePath, path.extname(filePath));
    const match = filename.match(/^[A-Za-z]+\d+/);
    return match ? match[0].toUpperCase() : filename;
}

function markdownToPlainText(markdown) {
    return markdown
        .replace(/^---[\s\S]*?---\s*/m, "")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/^>\s?/gm, "")
        .replace(/^\s*[-*+]\s+/gm, "")
        .replace(/^\s*\d+\.\s+/gm, "")
        .replace(/[*_~`]/g, "")
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function countWords(markdown) {
    const plain = markdownToPlainText(markdown);
    return plain ? plain.split(/\s+/).length : 0;
}

function readingTime(words) {
    return words ? Math.max(1, Math.ceil(words / 200)) : 0;
}

function xmlEscape(value) {
    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

async function generateSitemap(client) {
    const baseUrl = (
        process.env.PUBLIC_SITE_URL ||
        "https://shubworks.netlify.app"
    ).replace(/\/+$/, "");

    const result = await client.query(`
        SELECT slug, updated_at
        FROM works
        WHERE published = TRUE
        ORDER BY id ASC
    `);

    const urls = [
        {
            loc: `${baseUrl}/`,
            changefreq: "weekly",
            priority: "1.0"
        },
        {
            loc: `${baseUrl}/archive.html`,
            changefreq: "daily",
            priority: "0.9"
        },
        {
            loc: `${baseUrl}/map.html`,
            changefreq: "weekly",
            priority: "0.5"
        }
    ];

    for (const work of result.rows) {
        urls.push({
            loc: `${baseUrl}/reader.html?slug=${encodeURIComponent(work.slug)}`,
            lastmod: work.updated_at
                ? new Date(work.updated_at).toISOString()
                : null,
            changefreq: "monthly",
            priority: "0.8"
        });
    }

    const body = urls.map((url) => {
        return [
            "    <url>",
            `        <loc>${xmlEscape(url.loc)}</loc>`,
            url.lastmod
                ? `        <lastmod>${xmlEscape(url.lastmod)}</lastmod>`
                : "",
            `        <changefreq>${url.changefreq}</changefreq>`,
            `        <priority>${url.priority}</priority>`,
            "    </url>"
        ]
            .filter(Boolean)
            .join("\n");
    }).join("\n");

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;

    const sitemapPath = path.join(
        ROOT,
        "frontend",
        "sitemap.xml"
    );

    const temporaryPath = `${sitemapPath}.tmp`;

    fs.writeFileSync(
        temporaryPath,
        sitemap,
        "utf8"
    );

    fs.renameSync(
        temporaryPath,
        sitemapPath
    );

    return {
        count: urls.length,
        path: sitemapPath
    };
}

function metadataHash(item, type) {
    return sha256(JSON.stringify({
        id: item.id,
        title: item.title,
        cover: item.cover || null,
        universe: item.universe || null,
        description: item.description || null,
        categories: Array.isArray(item.categories) ? item.categories : [],
        type
    }));
}

async function ensureSchema(client) {
    const schema = fs.readFileSync(SCHEMA_FILE, "utf8");
    await client.query(schema);
}

async function upsertTag(client, name) {
    const clean = String(name || "").trim();
    if (!clean) return null;
    const result = await client.query(
        `INSERT INTO tags (name) VALUES ($1)
         ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name
         RETURNING id`,
        [clean]
    );
    return result.rows[0].id;
}

async function syncWork(client, item, type, stats) {
    const sourceId = String(item.id).toUpperCase();
    const slug = `${slugify(item.title)}-${sourceId.toLowerCase()}`;
    const hash = metadataHash(item, type);

    const existing = await client.query(
        `SELECT id, metadata_hash FROM works WHERE source_id = $1`,
        [sourceId]
    );

    const result = await client.query(
        `INSERT INTO works
            (source_id, title, slug, type, cover, universe, description, metadata_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (source_id) DO UPDATE SET
            title = EXCLUDED.title,
            slug = EXCLUDED.slug,
            type = EXCLUDED.type,
            cover = EXCLUDED.cover,
            universe = EXCLUDED.universe,
            description = EXCLUDED.description,
            metadata_hash = EXCLUDED.metadata_hash
         RETURNING id`,
        [
            sourceId,
            item.title,
            slug,
            type,
            item.cover || null,
            item.universe || null,
            item.description || null,
            hash
        ]
    );

    if (!existing.rowCount) stats.created++;
    else if (existing.rows[0].metadata_hash !== hash) stats.updated++;
    else stats.unchanged++;

    const workId = result.rows[0].id;

    // Reconcile tags instead of only adding them. This prevents stale categories.
    await client.query(`DELETE FROM work_tags WHERE work_id = $1`, [workId]);

    const categories = Array.isArray(item.categories) ? [...new Set(item.categories)] : [];
    for (const category of categories) {
        const tagId = await upsertTag(client, category);
        if (tagId) {
            await client.query(
                `INSERT INTO work_tags (work_id, tag_id)
                 VALUES ($1,$2) ON CONFLICT DO NOTHING`,
                [workId, tagId]
            );
        }
    }

    return workId;
}

async function syncMetadata(client) {
    const works = readJson(SOURCE_FILES.works);
    const novels = readJson(SOURCE_FILES.novels, false);
    const seriesData = readJson(SOURCE_FILES.series, false);

    validateMetadata(works, "data.json");
    validateMetadata(novels, "novels.json");
    validateMetadata(seriesData, "series.json");

    const stats = { created: 0, updated: 0, unchanged: 0 };
    const knownWorkIds = new Set();

    for (const item of works) {
        knownWorkIds.add(String(item.id).toUpperCase());
        await syncWork(client, item, getType(item.id), stats);
    }

    for (const item of novels) {
        knownWorkIds.add(String(item.id).toUpperCase());
        await syncWork(client, item, "novel", stats);
    }

    // Series are metadata entities, not works. Their parts can point to works when IDs match.
    for (const series of seriesData) {
        const seriesResult = await client.query(
            `INSERT INTO series (source_id,title,slug,cover,description)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (source_id) DO UPDATE SET
                title=EXCLUDED.title,
                slug=EXCLUDED.slug,
                cover=EXCLUDED.cover,
                description=EXCLUDED.description
             RETURNING id`,
            [
                series.id,
                series.title,
                `${slugify(series.title)}-${String(series.id).toLowerCase()}`,
                series.cover || null,
                series.description || null
            ]
        );

        const seriesId = seriesResult.rows[0].id;
        await client.query(`DELETE FROM series_parts WHERE series_id = $1`, [seriesId]);

        for (let i = 0; i < (series.parts || []).length; i++) {
            const part = series.parts[i];
            const partWork = await client.query(
                `SELECT id FROM works WHERE source_id = $1 LIMIT 1`,
                [String(part.id).toUpperCase()]
            );

            await client.query(
                `INSERT INTO series_parts
                    (source_id,series_id,title,cover,part_number,work_id)
                 VALUES ($1,$2,$3,$4,$5,$6)
                 ON CONFLICT (source_id) DO UPDATE SET
                    series_id=EXCLUDED.series_id,
                    title=EXCLUDED.title,
                    cover=EXCLUDED.cover,
                    part_number=EXCLUDED.part_number,
                    work_id=EXCLUDED.work_id`,
                [
                    String(part.id).toUpperCase(),
                    seriesId,
                    part.title,
                    part.cover || null,
                    i + 1,
                    partWork.rows[0]?.id || null
                ]
            );
        }
    }

    return { ...stats, sourceWorkCount: knownWorkIds.size, seriesCount: seriesData.length };
}

async function syncContent(client) {
    const files = getMarkdownFiles(CONTENT_DIR);
    const stats = { changed: 0, unchanged: 0, missing: 0, skipped: 0 };
    const seen = new Set();

    for (const filePath of files) {
        const sourceId = getSourceId(filePath);
        if (seen.has(sourceId)) {
            throw new Error(`Duplicate content source ID: ${sourceId} (${path.relative(ROOT, filePath)})`);
        }
        seen.add(sourceId);
        const relativePath = path.relative(ROOT, filePath).split(path.sep).join("/");
        const stat = fs.statSync(filePath);

        const existing = await client.query(
            `SELECT id, content_path, content_hash, content_size_bytes, content_mtime_ms
             FROM works WHERE LOWER(source_id) = LOWER($1) LIMIT 1`,
            [sourceId]
        );

        if (!existing.rowCount) {
            console.warn(`⚠️ Content has no matching work: ${relativePath}`);
            stats.missing++;
            continue;
        }

        const work = existing.rows[0];
        const sameFile =
            work.content_path === relativePath &&
            Number(work.content_size_bytes || 0) === stat.size &&
            Number(work.content_mtime_ms || 0) === Math.trunc(stat.mtimeMs) &&
            Boolean(work.content_hash);

        if (sameFile) {
            stats.unchanged++;
            continue;
        }

        // Read/hash only when the cheap filesystem fingerprint changed.
        const buffer = fs.readFileSync(filePath);
        const hash = sha256(buffer);

        if (work.content_hash === hash) {
            await client.query(
                `UPDATE works SET content_path=$1, content_size_bytes=$2, content_mtime_ms=$3
                 WHERE id=$4`,
                [relativePath, stat.size, Math.trunc(stat.mtimeMs), work.id]
            );
            stats.unchanged++;
            continue;
        }

        const markdown = buffer.toString("utf8");
        const words = countWords(markdown);
        const minutes = readingTime(words);

        // Keep content_path as the canonical source. We intentionally do not duplicate
        // the full Markdown into PostgreSQL for newly synced works.
        await client.query(
            `UPDATE works
             SET content_path=$1,
                 content_hash=$2,
                 content_size_bytes=$3,
                 content_mtime_ms=$4,
                 word_count=$5,
                 reading_time=$6,
                 content=NULL
             WHERE id=$7`,
            [relativePath, hash, stat.size, Math.trunc(stat.mtimeMs), words, minutes, work.id]
        );

        stats.changed++;
    }

    return { ...stats, totalFiles: files.length, seenSourceIds: seen };
}

async function sync({ prune = false } = {}) {
    const client = await pool.connect();
    const started = Date.now();

    try {
        console.log("\n╔══════════════════════════════════════╗");
        console.log("║        SHUBWORKS SYNC ENGINE         ║");
        console.log("╚══════════════════════════════════════╝\n");

        await client.query("BEGIN");
        await ensureSchema(client);
        console.log("✓ Database schema ready");

        const metadata = await syncMetadata(client);
        console.log(`✓ Metadata synchronized (${metadata.created} created, ${metadata.updated} updated, ${metadata.unchanged} unchanged)`);

        const content = await syncContent(client);
        console.log(`✓ Content synchronized (${content.changed} changed, ${content.unchanged} unchanged, ${content.missing} unmatched)`);

        if (prune) {
            const stale = await client.query(
                `SELECT id, source_id FROM works WHERE content_path IS NOT NULL`
            );
            let cleared = 0;
            for (const row of stale.rows) {
                if (!content.seenSourceIds.has(String(row.source_id).toUpperCase())) {
                    await client.query(
                        `UPDATE works
                         SET content_path=NULL, content_hash=NULL, content_size_bytes=0,
                             content_mtime_ms=0, content=NULL, word_count=0, reading_time=0
                         WHERE id=$1`,
                        [row.id]
                    );
                    cleared++;
                }
            }
            console.log(`✓ Prune check complete (${cleared} stale content pointers cleared)`);
        }

        await client.query("COMMIT");

        try {
            const sitemap = await generateSitemap(client);

            console.log(
                `✓ Sitemap generated (${sitemap.count} URLs)`
            );
        } catch (error) {
            console.warn(
                `⚠️ Sitemap generation failed: ${error.message}`
            );
        }

        console.log(
            `\n✓ PostgreSQL synchronized in ${((Date.now() - started) / 1000).toFixed(2)}s`
        );

        console.log("✓ SHUBWORKS is up to date.\n");
    } catch (error) {
        await client.query("ROLLBACK");
        console.error("\n❌ SYNC FAILED");
        console.error(error);
        process.exitCode = 1;
    } finally {
        client.release();
        await pool.end();
    }
}

if (require.main === module) {
    sync({ prune: process.argv.includes("--prune") });
}

module.exports = { sync };
