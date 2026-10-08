const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "..");

// ============================================================
// MASTER PROJECT
// ============================================================

const DATA_DIR = path.join(ROOT, "data");
const CONTENT_DIR = path.join(ROOT, "content");

const SOURCE_FILES = {
    works: path.join(DATA_DIR, "data.json"),
    novels: path.join(DATA_DIR, "novels.json")
};

// ============================================================
// NETLIFY PROJECT
// shubworks and shubworks-netlify are sibling folders
// ============================================================

const NETLIFY_DIR = path.resolve(
    ROOT,
    "..",
    "shubworks-netlify"
);

const NETLIFY_CONTENT_DIR = path.join(
    NETLIFY_DIR,
    "content"
);

const NETLIFY_DATA_DIR = path.join(
    NETLIFY_DIR,
    "archive-data"
);

// ============================================================
// HELPERS
// ============================================================

function readJson(filePath, required = true) {
    if (!fs.existsSync(filePath)) {
        if (required) {
            throw new Error(`Missing source file: ${filePath}`);
        }

        return [];
    }

    try {
        return JSON.parse(
            fs.readFileSync(filePath, "utf8")
        );
    } catch (error) {
        throw new Error(
            `Invalid JSON in ${filePath}: ${error.message}`
        );
    }
}

function slugify(text) {
    return String(text || "")
        .toLowerCase()
        .trim()
        .replace(/[’'"]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function getType(sourceId) {
    const prefix =
        String(sourceId)
            .match(/^[A-Za-z]+/)?.[0]
            ?.toUpperCase();

    return {
        P: "poem",
        B: "fable",
        S: "story",
        N: "novel"
    }[prefix] || "work";
}

function getMarkdownFiles(dir) {
    const files = [];

    if (!fs.existsSync(dir)) {
        return files;
    }

    const stack = [dir];

    while (stack.length) {
        const current = stack.pop();

        for (const entry of fs.readdirSync(
            current,
            { withFileTypes: true }
        )) {
            const fullPath = path.join(
                current,
                entry.name
            );

            if (entry.isDirectory()) {
                stack.push(fullPath);
            } else if (
                entry.isFile() &&
                entry.name
                    .toLowerCase()
                    .endsWith(".md")
            ) {
                files.push(fullPath);
            }
        }
    }

    return files.sort((a, b) =>
        a.localeCompare(b)
    );
}

function getSourceId(filePath) {
    const filename = path.basename(
        filePath,
        path.extname(filePath)
    );

    const match = filename.match(
        /^[A-Za-z]+\d+/
    );

    return match
        ? match[0].toUpperCase()
        : filename;
}

function markdownToPlainText(markdown) {
    return String(markdown)
        .replace(/^---[\s\S]*?---\s*/m, "")
        .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
        .replace(
            /\[([^\]]+)\]\([^)]*\)/g,
            "$1"
        )
        .replace(/^#{1,6}\s+/gm, "")
        .replace(/^>\s?/gm, "")
        .replace(
            /^\s*[-*+]\s+/gm,
            ""
        )
        .replace(
            /^\s*\d+\.\s+/gm,
            ""
        )
        .replace(/[*_~`]/g, "")
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function countWords(markdown) {
    const plain =
        markdownToPlainText(markdown);

    return plain
        ? plain.split(/\s+/).length
        : 0;
}

function readingTime(words) {
    return words
        ? Math.max(1, Math.ceil(words / 200))
        : 0;
}

function ensureDirectory(dir) {
    fs.mkdirSync(dir, {
        recursive: true
    });
}

// ============================================================
// VALIDATE MASTER DATA
// ============================================================

function validateMetadata(items, sourceName) {
    if (!Array.isArray(items)) {
        throw new Error(
            `${sourceName} must contain a JSON array.`
        );
    }

    const seen = new Set();

    for (const item of items) {
        if (!item || !item.id || !item.title) {
            throw new Error(
                `${sourceName}: every item needs id and title.`
            );
        }

        const id = String(item.id)
            .trim()
            .toUpperCase();

        if (seen.has(id)) {
            throw new Error(
                `${sourceName}: duplicate ID ${id}.`
            );
        }

        seen.add(id);
    }
}

// ============================================================
// BUILD PUBLIC WORK DATA
// ============================================================

function buildWorks(metadata, markdownMap) {
    const works = [];

    for (const item of metadata) {
        const sourceId = String(item.id)
            .trim()
            .toUpperCase();

        const type = getType(sourceId);

        const slug =
            `${slugify(item.title)}-${sourceId.toLowerCase()}`;

        const contentInfo =
            markdownMap.get(sourceId);

        if (!contentInfo) {
            console.warn(
                `⚠️ No Markdown content found for ${sourceId}`
            );
        }

        const wordCount =
            contentInfo
                ? contentInfo.wordCount
                : 0;

        const readingTimeValue =
            contentInfo
                ? readingTime(wordCount)
                : 0;

        works.push({
            id: sourceId,
            source_id: sourceId,
            title: item.title,
            slug,
            type,
            cover: item.cover || null,
            universe: item.universe || null,
            description: item.description || "",
            word_count: wordCount,
            reading_time: readingTimeValue,
            published: true,
            tags: Array.isArray(item.categories)
                ? [...new Set(item.categories)]
                : []
        });
    }

    return works;
}

// ============================================================
// COPY MARKDOWN CONTENT
// ============================================================

function syncContent() {
    ensureDirectory(NETLIFY_CONTENT_DIR);

    const files = getMarkdownFiles(CONTENT_DIR);

    const stats = {
        newFiles: 0,
        updated: 0,
        unchanged: 0,
        total: files.length
    };

    for (const sourcePath of files) {
        const relativePath = path.relative(
            CONTENT_DIR,
            sourcePath
        );

        const destinationPath = path.join(
            NETLIFY_CONTENT_DIR,
            relativePath
        );

        ensureDirectory(
            path.dirname(destinationPath)
        );

        const sourceBuffer =
            fs.readFileSync(sourcePath);

        if (!fs.existsSync(destinationPath)) {
            fs.copyFileSync(
                sourcePath,
                destinationPath
            );

            stats.newFiles++;
            continue;
        }

        const destinationBuffer =
            fs.readFileSync(destinationPath);

        const sourceHash = crypto
            .createHash("sha256")
            .update(sourceBuffer)
            .digest("hex");

        const destinationHash = crypto
            .createHash("sha256")
            .update(destinationBuffer)
            .digest("hex");

        if (sourceHash === destinationHash) {
            stats.unchanged++;
            continue;
        }

        fs.copyFileSync(
            sourcePath,
            destinationPath
        );

        stats.updated++;
    }

    return stats;
}

// ============================================================
// BUILD MARKDOWN MAP
// ============================================================

function buildMarkdownMap() {
    const files =
        getMarkdownFiles(CONTENT_DIR);

    const map = new Map();

    for (const filePath of files) {
        const sourceId =
            getSourceId(filePath);

        if (map.has(sourceId)) {
            throw new Error(
                `Duplicate Markdown source ID: ${sourceId}`
            );
        }

        const markdown =
            fs.readFileSync(
                filePath,
                "utf8"
            );

        map.set(sourceId, {
            sourcePath: filePath,
            relativePath: path.relative(
                CONTENT_DIR,
                filePath
            )
            .split(path.sep)
            .join("/"),
            wordCount:
                countWords(markdown)
        });
    }

    return map;
}

// ============================================================
// GENERATE works.json
// ============================================================

function generateWorksJson(works) {
    ensureDirectory(
        NETLIFY_DATA_DIR
    );

    const outputPath =
        path.join(
            NETLIFY_DATA_DIR,
            "works.json"
        );

    fs.writeFileSync(
        outputPath,
        JSON.stringify(
            works,
            null,
            2
        ),
        "utf8"
    );

    return outputPath;
}

// ============================================================
// GENERATE stats.json
// ============================================================

function generateStatsJson(works) {
    const stats = {
        success: true,

        stats: {
            totalWorks: works.length,

            poems: works.filter(
                work => work.type === "poem"
            ).length,

            fables: works.filter(
                work => work.type === "fable"
            ).length,

            stories: works.filter(
                work => work.type === "story"
            ).length,

            novels: works.filter(
                work => work.type === "novel"
            ).length,

            totalWords: works.reduce(
                (total, work) =>
                    total +
                    Number(
                        work.word_count || 0
                    ),
                0
            ),

            readingMinutes: works.reduce(
                (total, work) =>
                    total +
                    Number(
                        work.reading_time || 0
                    ),
                0
            )
        }
    };

    const outputPath =
        path.join(
            NETLIFY_DATA_DIR,
            "stats.json"
        );

    fs.writeFileSync(
        outputPath,
        JSON.stringify(
            stats,
            null,
            2
        ),
        "utf8"
    );

    return outputPath;
}

// ============================================================
// MAIN
// ============================================================

function run() {
    const started = Date.now();

    console.log("");
    console.log(
        "╔══════════════════════════════════════╗"
    );
    console.log(
        "║       SHUBWORKS NETLIFY SYNC         ║"
    );
    console.log(
        "╚══════════════════════════════════════╝"
    );
    console.log("");

    // --------------------------------------------------------
    // Safety check
    // --------------------------------------------------------

    if (!fs.existsSync(NETLIFY_DIR)) {
        throw new Error(
            `Netlify folder not found:\n${NETLIFY_DIR}`
        );
    }

    console.log(
        `Master:  ${ROOT}`
    );

    console.log(
        `Netlify: ${NETLIFY_DIR}`
    );

    console.log("");

    // --------------------------------------------------------
    // Read metadata
    // --------------------------------------------------------

    const worksData =
        readJson(
            SOURCE_FILES.works
        );

    const novelsData =
        readJson(
            SOURCE_FILES.novels,
            false
        );

    validateMetadata(
        worksData,
        "data.json"
    );

    validateMetadata(
        novelsData,
        "novels.json"
    );

    const allMetadata = [
        ...worksData,
        ...novelsData
    ];

    // Make sure an ID does not appear
    // in both data.json and novels.json.
    validateMetadata(
        allMetadata,
        "combined metadata"
    );

    console.log(
        `✓ Metadata loaded: ${allMetadata.length} works`
    );

    // --------------------------------------------------------
    // Read Markdown
    // --------------------------------------------------------

    const markdownMap =
        buildMarkdownMap();

    console.log(
        `✓ Markdown files found: ${markdownMap.size}`
    );

    // --------------------------------------------------------
    // Build public archive data
    // --------------------------------------------------------

    const works =
        buildWorks(
            allMetadata,
            markdownMap
        );

    // --------------------------------------------------------
    // Copy Markdown to Netlify
    // --------------------------------------------------------

    const contentStats =
        syncContent();

    console.log(
        `✓ Content synchronized`
    );

    console.log(
        `  ${contentStats.total} Markdown files`
    );

    console.log(
        `  ${contentStats.newFiles} new`
    );

    console.log(
        `  ${contentStats.updated} updated`
    );

    console.log(
        `  ${contentStats.unchanged} unchanged`
    );

    // --------------------------------------------------------
    // Generate JSON
    // --------------------------------------------------------

    generateWorksJson(works);

    console.log(
        `✓ archive-data/works.json generated`
    );

    generateStatsJson(works);

    console.log(
        `✓ archive-data/stats.json generated`
    );

    // --------------------------------------------------------
    // Final report
    // --------------------------------------------------------

    console.log("");

    console.log(
        `✓ Netlify publish folder prepared`
    );

    console.log(
        `✓ ${works.length} works available`
    );

    console.log(
        `✓ Completed in ${
            ((Date.now() - started) / 1000)
                .toFixed(2)
        }s`
    );

    console.log("");
}

try {
    run();
} catch (error) {
    console.error("");
    console.error(
        "❌ NETLIFY SYNC FAILED"
    );
    console.error(
        error.message
    );
    console.error("");

    process.exitCode = 1;
}