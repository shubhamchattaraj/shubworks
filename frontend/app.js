/* =========================================================
   SHUBWORKS
   Frontend Application
   ========================================================= */

(() => {
  "use strict";

  /* =======================================================
     CONFIG
     ======================================================= */

  const API = {
    works: "/api/works",
    stats: "/api/stats",
    workBySlug: (slug) => `/api/works/slug/${encodeURIComponent(slug)}`,
  };

  /* =======================================================
     GLOBAL STATE
     ======================================================= */

  const state = {
    works: [],
    currentWork: null,
    currentIndex: -1,
  };

  /* =======================================================
     DOM HELPERS
     ======================================================= */

  const $ = (selector, parent = document) => parent.querySelector(selector);

  const $$ = (selector, parent = document) =>
    Array.from(parent.querySelectorAll(selector));

  const exists = (selector) => Boolean($(selector));

  /* =======================================================
     GENERAL HELPERS
     ======================================================= */

  function escapeHTML(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function numberValue(value) {
    const number = Number(value);

    return Number.isFinite(number) ? number : 0;
  }

  function formatNumber(value) {
    return numberValue(value).toLocaleString("en-IN");
  }

  function formatType(type) {
    if (!type) return "WORK";

    return String(type)
      .replace(/[-_]/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase());
  }

  function normalizeType(type) {
    return String(type || "")
      .trim()
      .toLowerCase()
      .replace(/[-_\s]+/g, "");
  }

  function formatReadingTime(value) {
    if (value === null || value === undefined || value === "") {
      return "—";
    }

    const raw = String(value).trim();

    if (!raw) return "—";

    /*
      Existing database values may already be human-readable,
      e.g. "8 min" or "12 minutes".
    */

    if (/[a-zA-Z]/.test(raw)) {
      return raw;
    }

    const minutes = Number(raw);

    if (!Number.isFinite(minutes)) {
      return raw;
    }

    if (minutes < 1) {
      return "< 1 min";
    }

    if (minutes < 60) {
      return `${Math.round(minutes)} min`;
    }

    const hours = Math.floor(minutes / 60);
    const remaining = Math.round(minutes % 60);

    if (remaining === 0) {
      return `${hours} hr`;
    }

    return `${hours} hr ${remaining} min`;
  }

  function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return String(value);
    }

    return new Intl.DateTimeFormat("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(date);
  }

  function getDescription(work) {
    return (
      work.description || work.summary || work.excerpt || work.subtitle || ""
    );
  }

  function getWordCount(work) {
    return numberValue(work.word_count ?? work.wordCount ?? work.words);
  }

  function countContentWords(content) {
    return String(content || "")
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/[#>*_`~\[\]()]/g, " ")
      .split(/\s+/)
      .filter(Boolean).length;
  }

  function getReadingTime(work) {
    return work.reading_time ?? work.readingTime ?? "";
  }

  function getSlug(work) {
    return work.slug || work.url_slug || work.path || "";
  }

  function getTitle(work) {
    return work.title || "Untitled Work";
  }

  function getType(work) {
    return work.type || "work";
  }

  function getWorksFromResponse(data) {
    if (Array.isArray(data)) {
      return data;
    }

    if (Array.isArray(data?.works)) {
      return data.works;
    }

    if (Array.isArray(data?.data)) {
      return data.data;
    }

    return [];
  }

  function isPublished(work) {
    // The database defaults published to TRUE. Only an explicit false
    // is treated as unpublished so older rows remain visible.
    return work?.published !== false && work?.published !== 0;
  }

  function getPublicWorks(works) {
    return Array.isArray(works) ? works.filter(isPublished) : [];
  }

  /* =======================================================
     API
     ======================================================= */

  async function fetchWorks(params = {}) {
    const payload = await window.SHUBWORKS_API.getWorks(params);
    const works = getPublicWorks(payload?.data || []);
    state.works = works;
    state.pagination = payload?.pagination || null;
    return works;
  }

  async function fetchStats() {
    return window.SHUBWORKS_API.getStats();
  }

  async function fetchWork(slug) {
    return window.SHUBWORKS_API.getWork(slug);
  }

  /* =======================================================
     PAGE DETECTION
     ======================================================= */

  function getPage() {
    const declaredPage = document.body?.dataset?.page;

    if (declaredPage) {
      return declaredPage;
    }

    const pathname = window.location.pathname.split("/").pop().toLowerCase();

    if (pathname === "" || pathname === "index.html") {
      return "home";
    }

    return "";
  }

  /* =======================================================
     MOBILE NAVIGATION
     ======================================================= */

  function initMobileNavigation() {
    const menuButton = $("#menu-button");
    const mobileNavigation = $("#mobile-navigation");
    const closeButton = $("#mobile-close");

    if (!menuButton || !mobileNavigation) {
      return;
    }

    function openMenu() {
      document.body.classList.add("menu-open");

      mobileNavigation.classList.add("is-open");

      mobileNavigation.setAttribute("aria-hidden", "false");

      menuButton.setAttribute("aria-expanded", "true");
    }

    function closeMenu() {
      document.body.classList.remove("menu-open");

      mobileNavigation.classList.remove("is-open");

      mobileNavigation.setAttribute("aria-hidden", "true");

      menuButton.setAttribute("aria-expanded", "false");
    }

    menuButton.addEventListener("click", () => {
      if (mobileNavigation.classList.contains("is-open")) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    if (closeButton) {
      closeButton.addEventListener("click", closeMenu);
    }

    $$(".mobile-nav a").forEach((link) => {
      link.addEventListener("click", closeMenu);
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeMenu();
      }
    });
  }

  /* =======================================================
     NAV COUNTS
     ======================================================= */

  function updateNavCounts(works, stats = null) {
    const payload = getStatsPayload(stats);
    const count = numberValue(payload.totalWorks ?? works.length);

    const desktopCount = $("#nav-count");

    if (desktopCount) {
      desktopCount.textContent = count;
    }

    const mobileCount = $("#mobile-nav-count");

    if (mobileCount) {
      mobileCount.textContent = count;
    }

    const liveCount = $("#nav-live-count");

    if (liveCount) {
      liveCount.textContent = count;
    }
  }

  /* =======================================================
     HOMEPAGE — CATEGORY COUNTS
     ======================================================= */

  function updateCategoryCounts(works, stats = {}) {
    const payload = getStatsPayload(stats);

    const fallback = { fable: 0, poem: 0, story: 0, novel: 0 };

    (works || []).forEach((work) => {
      const type = normalizeType(getType(work));
      if (type === "fable") fallback.fable++;
      if (type === "poem") fallback.poem++;
      if (type === "story" || type === "stories") fallback.story++;
      if (type === "novel" || type === "novels") fallback.novel++;
    });

    const counts = {
      fable: numberValue(payload.fables ?? fallback.fable),
      poem: numberValue(payload.poems ?? fallback.poem),
      story: numberValue(payload.stories ?? fallback.story),
      novel: numberValue(payload.novels ?? fallback.novel),
    };

    const elements = {
      fable: $("#fable-count"),
      poem: $("#poem-count"),
      story: $("#story-count"),
      novel: $("#novel-count"),
      statFables: $("#stat-fables"),
      statPoems: $("#stat-poems"),
      statStories: $("#stat-stories"),
      statNovels: $("#stat-novels"),
    };

    if (elements.fable) elements.fable.textContent = formatNumber(counts.fable);
    if (elements.poem) elements.poem.textContent = formatNumber(counts.poem);
    if (elements.story) elements.story.textContent = formatNumber(counts.story);
    if (elements.novel) elements.novel.textContent = formatNumber(counts.novel);
    if (elements.statFables)
      elements.statFables.textContent = formatNumber(counts.fable);
    if (elements.statPoems)
      elements.statPoems.textContent = formatNumber(counts.poem);
    if (elements.statStories)
      elements.statStories.textContent = formatNumber(counts.story);
    if (elements.statNovels)
      elements.statNovels.textContent = formatNumber(counts.novel);
  }

  /* =======================================================
     HOMEPAGE — STATISTICS
     ======================================================= */

  function getStatsPayload(stats) {
    return stats?.stats && typeof stats.stats === "object"
      ? stats.stats
      : stats || {};
  }

  function getTotalWords(stats, works = []) {
    const payload = getStatsPayload(stats);

    // Homepage totals must come from the database aggregate.
    // `works` is intentionally paginated (usually only 8 featured works),
    // so summing it would produce a misleading partial total.
    const directValue =
      payload.totalWords ?? payload.total_words ?? payload.words;

    if (directValue !== undefined && directValue !== null) {
      return numberValue(directValue);
    }

    // Defensive fallback for an unavailable/legacy stats response.
    return (works || []).reduce((total, work) => total + getWordCount(work), 0);
  }

  function getTotalReadingMinutes(stats, works = []) {
    const payload = getStatsPayload(stats);

    const directValue =
      payload.totalReadingMinutes ??
      payload.total_reading_minutes ??
      payload.readingMinutes;

    // Same rule as words: use the database aggregate, not the small
    // paginated featured-work collection.
    if (directValue !== undefined && directValue !== null) {
      return numberValue(directValue);
    }

    return (works || []).reduce(
      (total, work) => total + numberValue(getReadingTime(work)),
      0,
    );
  }

  function minutesToDisplay(minutes) {
    const total = Math.max(0, Math.round(numberValue(minutes)));

    if (total < 60) {
      return `${total}m`;
    }

    const hours = Math.floor(total / 60);
    const remaining = total % 60;

    if (remaining === 0) {
      return `${hours}h`;
    }

    return `${hours}h ${remaining}m`;
  }

  function updateHomepageStats(stats, works) {
    const words = getTotalWords(stats, works);

    const readingMinutes = getTotalReadingMinutes(stats, works);

    const wordElement = $("#stat-words");

    if (wordElement) {
      wordElement.textContent = formatNumber(words);
    }

    const hoursElement = $("#stat-hours");

    if (hoursElement) {
      hoursElement.textContent = minutesToDisplay(readingMinutes);
    }

    const payload = getStatsPayload(stats);
    const reportedWorks = payload.totalWorks ?? payload.total_works;
    // The live /api/works collection is authoritative for the homepage.
    const totalWorks = numberValue(payload.totalWorks ?? works.length);

    const worksElement = $("#stat-works");

    if (worksElement) {
      worksElement.textContent = formatNumber(totalWorks);
    }

    const totalWorksElement = $("#total-works");

    if (totalWorksElement) {
      totalWorksElement.textContent = formatNumber(totalWorks);
    }
  }

  /* =======================================================
     HOMEPAGE — RECENT / FEATURED WORKS
     ======================================================= */

  function sortWorksNewestFirst(works) {
    return [...works].sort((a, b) => {
      const dateA = new Date(a.created_at || a.createdAt || 0).getTime();

      const dateB = new Date(b.created_at || b.createdAt || 0).getTime();

      if (Number.isFinite(dateA) && Number.isFinite(dateB) && dateA !== dateB) {
        return dateB - dateA;
      }

      return numberValue(b.id) - numberValue(a.id);
    });
  }

  function renderFeaturedWorks(works) {
    const container = $("#featured-list");

    if (!container) {
      return;
    }

    const recent = sortWorksNewestFirst(works).slice(0, 8);

    if (!recent.length) {
      container.innerHTML = `
        <div class="archive-empty">
          <strong>NO WORKS YET</strong>
          <span>The archive is waiting for its first entry.</span>
        </div>
      `;

      return;
    }

    container.innerHTML = recent
      .map((work, index) => {
        const slug = getSlug(work);
        const title = escapeHTML(getTitle(work));

        const type = escapeHTML(formatType(getType(work)));

        const words = getWordCount(work);

        const readingTime = formatReadingTime(getReadingTime(work));

        if (!slug) {
          return "";
        }

        return `
          <a
            class="featured-item"
            href="reader.html?slug=${encodeURIComponent(slug)}"
          >

            <span class="featured-number">
              ${String(index + 1).padStart(2, "0")}
            </span>

            <h3 class="featured-title">
              ${title}
            </h3>

            <span class="featured-type">
              ${type}
            </span>

            <span class="featured-meta">
              ${words ? formatNumber(words) + " WORDS" : readingTime}
            </span>

            <span class="featured-arrow">
              →
            </span>

          </a>
        `;
      })
      .join("");
  }

  /* =======================================================
     HOMEPAGE
     ======================================================= */

  async function initHomepage() {
    if (getPage() !== "home") {
      return;
    }

    try {
      const [worksPayload, stats] = await Promise.all([
        window.SHUBWORKS_API.getWorks({ page: 1, limit: 8, sort: "newest" }),
        fetchStats().catch(() => ({})),
      ]);

      const works = getPublicWorks(worksPayload?.data || []);

      updateNavCounts(works, stats);

      updateCategoryCounts(works, stats);

      updateHomepageStats(stats, works);

      renderFeaturedWorks(works);
    } catch (error) {
      console.error("SHUBWORKS homepage error:", error);

      const featured = $("#featured-list");

      if (featured) {
        featured.innerHTML = `
          <div class="archive-empty">
            <strong>ARCHIVE TEMPORARILY UNAVAILABLE</strong>
            <span>
              The frontend could not connect to the archive API.
            </span>
          </div>
        `;
      }
    }
  }

  /* =======================================================
     READER — URL
     ======================================================= */

  function getReaderSlug() {
    const params = new URLSearchParams(window.location.search);

    return params.get("slug");
  }

  /* =======================================================
     READER — CONTENT
     ======================================================= */

  function getWorkContent(work) {
    return work.content || work.body || work.text || work.markdown || "";
  }

  /* =======================================================
     MARKDOWN
     Lightweight renderer for archive content.
     ======================================================= */

  function escapeMarkdownText(value) {
    return escapeHTML(value);
  }

  function renderInlineMarkdown(value) {
    let text = escapeMarkdownText(value);

    /*
      Images
    */

    text = text.replace(
      /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
      (_, alt, url, title) => {
        const safeURL = sanitizeURL(url);

        if (!safeURL) {
          return "";
        }

        const titleAttribute = title ? ` title="${escapeHTML(title)}"` : "";

        return `
          <img
            src="${escapeHTML(safeURL)}"
            alt="${escapeHTML(alt)}"
            ${titleAttribute}
            loading="lazy"
          />
        `;
      },
    );

    /*
      Links
    */

    text = text.replace(
      /\[([^\]]+)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)/g,
      (_, label, url, title) => {
        const safeURL = sanitizeURL(url);

        if (!safeURL) {
          return escapeMarkdownText(label);
        }

        const titleAttribute = title ? ` title="${escapeHTML(title)}"` : "";

        return `
          <a
            href="${escapeHTML(safeURL)}"
            target="_blank"
            rel="noopener noreferrer"
            ${titleAttribute}
          >
            ${label}
          </a>
        `;
      },
    );

    /*
      Bold
    */

    text = text.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

    text = text.replace(/__(.+?)__/g, "<strong>$1</strong>");

    /*
      Italic
    */

    text = text.replace(/(^|[^\*])\*([^*\n]+)\*(?!\*)/g, "$1<em>$2</em>");

    text = text.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, "$1<em>$2</em>");

    /*
      Inline code
    */

    text = text.replace(/`([^`]+)`/g, "<code>$1</code>");

    return text;
  }

  function sanitizeURL(url) {
    const value = String(url || "").trim();

    if (!value) {
      return "";
    }

    /*
      Relative URLs are allowed.
    */

    if (
      value.startsWith("/") ||
      value.startsWith("./") ||
      value.startsWith("../") ||
      value.startsWith("#")
    ) {
      return value;
    }

    try {
      const parsed = new URL(value, window.location.href);

      const allowedProtocols = ["http:", "https:", "mailto:"];

      if (!allowedProtocols.includes(parsed.protocol)) {
        return "";
      }

      return parsed.href;
    } catch {
      return "";
    }
  }

  function poemToHTML(source) {
    const lines = source.split("\n");
    const stanzas = [];
    let current = [];

    const flush = () => {
      if (!current.length) return;
      stanzas.push(current);
      current = [];
    };

    lines.forEach((line) => {
      if (!line.trim()) {
        flush();
      } else {
        current.push(line);
      }
    });

    flush();

    return stanzas
      .map(
        (stanza) => `
      <div class="poem-stanza">
        ${stanza.map((line) => `<div class="poem-line">${renderInlineMarkdown(line.trim())}</div>`).join("")}
      </div>
    `,
      )
      .join("");
  }

  function markdownToHTML(markdown, type = "") {
    if (!markdown) {
      return "";
    }

    const source = String(markdown)
      .replace(/^\uFEFF/, "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");

    // Poems are authored as line-oriented Markdown/plain text.
    // A normal Markdown paragraph collapses those lines into one line,
    // which destroys the poem's original form. Preserve every authored
    // line and every blank line (stanza break) for poem works.
    if (normalizeType(type) === "poem") {
      return poemToHTML(source);
    }

    const lines = source.split("\n");

    const output = [];

    let paragraph = [];

    let inCodeBlock = false;

    let codeLanguage = "";

    let codeLines = [];

    let inUnorderedList = false;

    let inOrderedList = false;

    let inBlockquote = false;

    let quoteLines = [];

    function flushParagraph() {
      if (!paragraph.length) {
        return;
      }

      const text = paragraph.join(" ").trim();

      if (text) {
        output.push(`<p>${renderInlineMarkdown(text)}</p>`);
      }

      paragraph = [];
    }

    function closeList() {
      if (inUnorderedList) {
        output.push("</ul>");
        inUnorderedList = false;
      }

      if (inOrderedList) {
        output.push("</ol>");
        inOrderedList = false;
      }
    }

    function flushQuote() {
      if (!inBlockquote) {
        return;
      }

      const content = quoteLines
        .map((line) => renderInlineMarkdown(line))
        .join("<br>");

      output.push(`<blockquote><p>${content}</p></blockquote>`);

      quoteLines = [];
      inBlockquote = false;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      /*
        Fenced code block
      */

      if (line.trim().startsWith("```")) {
        if (!inCodeBlock) {
          flushParagraph();
          flushQuote();
          closeList();

          inCodeBlock = true;

          codeLanguage = line.trim().slice(3).trim();

          codeLines = [];
        } else {
          const languageClass = codeLanguage
            ? ` class="language-${escapeHTML(codeLanguage)}"`
            : "";

          output.push(
            `<pre><code${languageClass}>${escapeHTML(
              codeLines.join("\n"),
            )}</code></pre>`,
          );

          inCodeBlock = false;
          codeLanguage = "";
          codeLines = [];
        }

        continue;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      /*
        Blank line
      */

      if (!line.trim()) {
        flushParagraph();
        flushQuote();
        closeList();

        continue;
      }

      /*
        Horizontal rule
      */

      if (
        /^(\*\s*){3,}$/.test(line.trim()) ||
        /^(-\s*){3,}$/.test(line.trim()) ||
        /^(_\s*){3,}$/.test(line.trim())
      ) {
        flushParagraph();
        flushQuote();
        closeList();

        output.push("<hr>");

        continue;
      }

      /*
        Headings
      */

      const heading = line.match(/^(#{1,6})\s+(.+)$/);

      if (heading) {
        flushParagraph();
        flushQuote();
        closeList();

        const level = heading[1].length;

        output.push(
          `<h${level}>${renderInlineMarkdown(heading[2])}</h${level}>`,
        );

        continue;
      }

      /*
        Blockquote
      */

      if (line.trim().startsWith(">")) {
        flushParagraph();
        closeList();

        if (!inBlockquote) {
          inBlockquote = true;
          quoteLines = [];
        }

        quoteLines.push(line.trim().replace(/^>\s?/, ""));

        continue;
      }

      if (inBlockquote) {
        flushQuote();
      }

      /*
        Unordered list
      */

      const unordered = line.match(/^\s*[-*+]\s+(.+)$/);

      if (unordered) {
        flushParagraph();

        if (inOrderedList) {
          output.push("</ol>");
          inOrderedList = false;
        }

        if (!inUnorderedList) {
          output.push("<ul>");
          inUnorderedList = true;
        }

        output.push(`<li>${renderInlineMarkdown(unordered[1])}</li>`);

        continue;
      }

      /*
        Ordered list
      */

      const ordered = line.match(/^\s*\d+\.\s+(.+)$/);

      if (ordered) {
        flushParagraph();

        if (inUnorderedList) {
          output.push("</ul>");
          inUnorderedList = false;
        }

        if (!inOrderedList) {
          output.push("<ol>");
          inOrderedList = true;
        }

        output.push(`<li>${renderInlineMarkdown(ordered[1])}</li>`);

        continue;
      }

      /*
        Regular paragraph
      */

      closeList();

      paragraph.push(line.trim());
    }

    if (inCodeBlock) {
      output.push(
        `<pre><code>${escapeHTML(codeLines.join("\n"))}</code></pre>`,
      );
    }

    flushParagraph();
    flushQuote();
    closeList();

    return output.join("\n");
  }

  /* =======================================================
     READER — META
     ======================================================= */

  function populateReaderMeta(work) {
    const title = getTitle(work);

    const type = formatType(getType(work));

    const words = getWordCount(work);

    const readingTime = getReadingTime(work);

    const date =
      work.created_at ||
      work.createdAt ||
      work.published_at ||
      work.publishedAt;

    const titleElement = $("#reader-title");

    if (titleElement) {
      titleElement.textContent = title;

      document.title = `${title} — SHUBWORKS`;
    }

    const typeElement = $("#reader-type");

    if (typeElement) {
      typeElement.textContent = type.toUpperCase();
    }

    const metaType = $("#reader-meta-type");

    if (metaType) {
      metaType.textContent = type.toUpperCase();
    }

    const wordElement = $("#reader-word-count");

    if (wordElement) {
      wordElement.textContent = words ? formatNumber(words) : "—";
    }

    const readingElement = $("#reader-reading-time");

    if (readingElement) {
      readingElement.textContent = formatReadingTime(readingTime);
    }

    const dateElement = $("#reader-date");

    if (dateElement) {
      dateElement.textContent = formatDate(date);
    }

    const description = $("#reader-description");

    if (description) {
      const text = getDescription(work);

      description.textContent =
        text || "A work from the SHUBWORKS literary archive.";
    }

    const indexElement = $("#reader-index");

    if (indexElement) {
      const originalIndex =
        state.currentIndex >= 0 ? state.currentIndex + 1 : null;

      indexElement.textContent = originalIndex
        ? String(originalIndex).padStart(3, "0")
        : "—";
    }
  }

  /* =======================================================
     READER — PREVIOUS / NEXT
     ======================================================= */

  function setupReaderNavigation() {
    const previousLink = $("#previous-work");

    const previousTitle = $("#previous-work-title");

    const nextLink = $("#next-work");

    const nextTitle = $("#next-work-title");

    if (state.currentIndex < 0 || !state.works.length) {
      return;
    }

    const previous =
      state.currentIndex > 0 ? state.works[state.currentIndex - 1] : null;

    const next =
      state.currentIndex < state.works.length - 1
        ? state.works[state.currentIndex + 1]
        : null;

    if (previous) {
      const slug = getSlug(previous);

      if (previousLink && slug) {
        previousLink.href = `reader.html?slug=${encodeURIComponent(slug)}`;

        previousLink.removeAttribute("aria-disabled");
      }

      if (previousTitle) {
        previousTitle.textContent = getTitle(previous);
      }
    } else {
      if (previousLink) {
        previousLink.href = "archive.html";

        previousLink.setAttribute("aria-disabled", "true");
      }

      if (previousTitle) {
        previousTitle.textContent = "BEGINNING OF ARCHIVE";
      }
    }

    if (next) {
      const slug = getSlug(next);

      if (nextLink && slug) {
        nextLink.href = `reader.html?slug=${encodeURIComponent(slug)}`;

        nextLink.removeAttribute("aria-disabled");
      }

      if (nextTitle) {
        nextTitle.textContent = getTitle(next);
      }
    } else {
      if (nextLink) {
        nextLink.href = "archive.html";

        nextLink.setAttribute("aria-disabled", "true");
      }

      if (nextTitle) {
        nextTitle.textContent = "END OF ARCHIVE";
      }
    }
  }

  /* =======================================================
     READER — PROGRESS
     ======================================================= */

  function initReadingProgress() {
    if (getPage() !== "reader") {
      return;
    }

    const bar = $("#reading-progress-bar");

    const text = $("#reader-progress-text");

    if (!bar && !text) {
      return;
    }

    function updateProgress() {
      const documentHeight =
        document.documentElement.scrollHeight - window.innerHeight;

      if (documentHeight <= 0) {
        if (bar) {
          bar.style.width = "0%";
        }

        if (text) {
          text.textContent = "0%";
        }

        return;
      }

      const scrollTop = window.scrollY;

      const percentage = Math.min(
        100,
        Math.max(0, (scrollTop / documentHeight) * 100),
      );

      const rounded = Math.round(percentage);

      if (bar) {
        bar.style.width = `${percentage}%`;
      }

      if (text) {
        text.textContent = `${rounded}%`;
      }
    }

    window.addEventListener("scroll", updateProgress, { passive: true });

    window.addEventListener("resize", updateProgress, { passive: true });

    updateProgress();
  }

  /* =======================================================
     READER — ERROR STATE
     ======================================================= */

  function showReaderError() {
    const error = $("#reader-error");

    const mainReader = $("#reader");

    if (error) {
      error.hidden = false;
    }

    /*
      Keep navigation/footer usable,
      but hide the normal reader content.
    */

    if (mainReader) {
      mainReader
        .querySelectorAll(
          ".reader-header, .reader-intro, .reader-body-section, .reader-navigation",
        )
        .forEach((element) => {
          element.hidden = true;
        });
    }
  }

  /* =======================================================
     READER — LOAD
     ======================================================= */

  async function initReader() {
    if (getPage() !== "reader") {
      return;
    }

    const slug = getReaderSlug();

    if (!slug) {
      showReaderError();
      return;
    }

    try {
      /*
        Fetch the complete works list as well as
        the individual work.

        The list is used for previous/next navigation.
      */

      const [workResponse, works] = await Promise.all([
        fetchWork(slug),
        fetchWorks(),
      ]);

      /*
        The API may return the work directly,
        or inside a `work` / `data` property.
      */

      const work = workResponse?.work || workResponse?.data || workResponse;

      if (!work || typeof work !== "object") {
        throw new Error("Work not found");
      }

      if (!isPublished(work)) {
        throw new Error("This work is not published.");
      }

      state.currentWork = work;

      /*
        Find the current work in the
        archive list.
      */

      state.currentIndex = works.findIndex(
        (item) => getSlug(item) === getSlug(work),
      );

      /*
        If slug matching doesn't work,
        try matching the requested slug.
      */

      if (state.currentIndex < 0) {
        state.currentIndex = works.findIndex((item) => getSlug(item) === slug);
      }

      populateReaderMeta(work);

      setupReaderNavigation();

      const article = $("#reader-body");

      if (!article) {
        return;
      }

      const loading = $("#reader-loading");

      if (loading) {
        loading.remove();
      }

      const content = getWorkContent(work);

      if (!content.trim()) {
        article.innerHTML = `
          <div class="reader-empty">
            <p>
              This work exists in the archive,
              but its reading text is currently empty.
            </p>
          </div>
        `;

        return;
      }

      article.innerHTML = markdownToHTML(content, getType(work));

      article.dataset.workType = normalizeType(getType(work));

      /*
        Add a small reading entrance animation.
      */

      article.classList.add("reader-content-loaded");

      /*
        Recalculate progress once the article
        has been inserted.
      */

      requestAnimationFrame(() => {
        window.dispatchEvent(new Event("resize"));
      });
    } catch (error) {
      console.error("SHUBWORKS reader error:", error);

      showReaderError();
    }
  }

  /* =======================================================
     READER KEYBOARD NAVIGATION
     ======================================================= */

  function initReaderKeyboardNavigation() {
    if (getPage() !== "reader") {
      return;
    }

    document.addEventListener("keydown", (event) => {
      /*
          Don't hijack keyboard shortcuts while
          typing into inputs/textareas.
        */

      const tag = event.target?.tagName;

      if (tag === "INPUT" || tag === "TEXTAREA") {
        return;
      }

      if (event.key === "ArrowLeft") {
        const link = $("#previous-work");

        if (link && !link.getAttribute("aria-disabled")) {
          window.location.href = link.href;
        }
      }

      if (event.key === "ArrowRight") {
        const link = $("#next-work");

        if (link && !link.getAttribute("aria-disabled")) {
          window.location.href = link.href;
        }
      }
    });
  }

  /* =======================================================
     REVEAL ANIMATIONS
     ======================================================= */

  function initRevealAnimations() {
    const elements = $$(".reveal");

    if (!elements.length) {
      return;
    }

    if (!("IntersectionObserver" in window)) {
      elements.forEach((element) => {
        element.classList.add("is-visible");
      });

      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");

            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.12,
      },
    );

    elements.forEach((element) => observer.observe(element));
  }

  /* =======================================================
     FOOTER YEAR
     ======================================================= */

  function initFooterYear() {
    const year = $("#footer-year");

    if (year) {
      year.textContent = new Date().getFullYear();
    }
  }

  /* =======================================================
     ARCHIVE SUPPORT
     ======================================================= */

  /*
    archive.html already contains its own
    filtering/search/rendering layer.

    We deliberately don't initialize a second
    archive renderer here because that would cause
    duplicate event listeners and duplicate API
    requests.

    This function only updates shared navigation
    information when archive.html is loaded.
  */

  async function initArchiveSharedData() {
    if (getPage() !== "archive") {
      return;
    }

    try {
      const works = await fetchWorks();

      updateNavCounts(works);
    } catch (error) {
      console.error("SHUBWORKS archive API error:", error);
    }
  }

  /* =======================================================
     MAGNETIC / MICRO INTERACTIONS
     ======================================================= */

  function initMagneticLinks() {
    /*
      Keep this deliberately subtle.
      No cursor replacement or aggressive movement.
    */

    const elements = $$(".featured-item, .reader-nav-card, .filter-btn");

    if (window.matchMedia("(pointer: coarse)").matches) {
      return;
    }

    elements.forEach((element) => {
      element.addEventListener("mousemove", (event) => {
        const rect = element.getBoundingClientRect();

        const x = event.clientX - rect.left - rect.width / 2;

        const y = event.clientY - rect.top - rect.height / 2;

        const strength = element.classList.contains("filter-btn")
          ? 0.05
          : 0.025;

        element.style.transform = `translate(${x * strength}px, ${y * strength}px)`;
      });

      element.addEventListener("mouseleave", () => {
        element.style.transform = "";
      });
    });
  }

  /* =======================================================
     SMOOTH ANCHOR LINKS
     ======================================================= */

  function initAnchorLinks() {
    $$('a[href^="#"]').forEach((link) => {
      link.addEventListener("click", (event) => {
        const href = link.getAttribute("href");

        if (!href || href === "#") {
          return;
        }

        const target = $(href);

        if (!target) {
          return;
        }

        event.preventDefault();

        target.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      });
    });
  }

  /* =======================================================
     INITIALIZATION
     ======================================================= */

  async function init() {
    initMobileNavigation();

    initFooterYear();

    initRevealAnimations();

    initAnchorLinks();

    initReaderProgressSafe();

    await initHomepage();

    await initArchiveSharedData();

    await initReader();

    initReaderKeyboardNavigation();

    /*
      Run after dynamic homepage/reader content
      has been created.
    */

    requestAnimationFrame(() => {
      initMagneticLinks();
    });
  }

  /* =======================================================
     SAFE READER PROGRESS INITIALIZATION
     ======================================================= */

  function initReaderProgressSafe() {
    initReadingProgress();
  }

  /* =======================================================
     START
     ======================================================= */

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
