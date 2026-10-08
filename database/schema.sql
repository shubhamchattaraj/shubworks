-- =========================================
-- SHUBWORKS DATABASE
-- PostgreSQL runtime store
-- =========================================

CREATE TABLE IF NOT EXISTS works (
    id SERIAL PRIMARY KEY,
    source_id VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    slug VARCHAR(500) UNIQUE NOT NULL,
    type VARCHAR(50) NOT NULL,
    cover VARCHAR(1000),
    universe VARCHAR(500),
    description TEXT,

    -- Runtime metadata. Literary source files remain in /content.
    content TEXT,
    content_path VARCHAR(1000),
    content_hash CHAR(64),
    content_size_bytes BIGINT DEFAULT 0,
    content_mtime_ms BIGINT DEFAULT 0,

    word_count INTEGER DEFAULT 0,
    reading_time INTEGER DEFAULT 0,
    published BOOLEAN DEFAULT TRUE,
    metadata_hash CHAR(64),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tags (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS work_tags (
    work_id INTEGER NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (work_id, tag_id)
);

CREATE TABLE IF NOT EXISTS series (
    id SERIAL PRIMARY KEY,
    source_id VARCHAR(50) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    slug VARCHAR(500) UNIQUE NOT NULL,
    cover VARCHAR(1000),
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS series_parts (
    id SERIAL PRIMARY KEY,
    source_id VARCHAR(50) UNIQUE NOT NULL,
    series_id INTEGER NOT NULL REFERENCES series(id) ON DELETE CASCADE,
    title VARCHAR(500) NOT NULL,
    cover VARCHAR(1000),
    part_number INTEGER NOT NULL,
    work_id INTEGER REFERENCES works(id) ON DELETE SET NULL
);

-- Existing databases created from the old schema are upgraded by these statements.
ALTER TABLE works ADD COLUMN IF NOT EXISTS content_path VARCHAR(1000);
ALTER TABLE works ADD COLUMN IF NOT EXISTS content_hash CHAR(64);
ALTER TABLE works ADD COLUMN IF NOT EXISTS content_size_bytes BIGINT DEFAULT 0;
ALTER TABLE works ADD COLUMN IF NOT EXISTS content_mtime_ms BIGINT DEFAULT 0;
ALTER TABLE works ADD COLUMN IF NOT EXISTS metadata_hash CHAR(64);
ALTER TABLE works ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE series ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;

CREATE INDEX IF NOT EXISTS idx_works_type ON works(type);
CREATE INDEX IF NOT EXISTS idx_works_universe ON works(universe);
CREATE INDEX IF NOT EXISTS idx_works_title ON works(title);
CREATE INDEX IF NOT EXISTS idx_works_created_at ON works(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_works_updated_at ON works(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_works_content_hash ON works(content_hash);
CREATE INDEX IF NOT EXISTS idx_series_title ON series(title);
CREATE INDEX IF NOT EXISTS idx_series_parts_series ON series_parts(series_id, part_number);

CREATE INDEX IF NOT EXISTS idx_work_tags_tag ON work_tags(tag_id);

-- Keep updated_at useful even when future SQL updates omit it.
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_works_updated_at ON works;
CREATE TRIGGER trg_works_updated_at
BEFORE UPDATE ON works
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_series_updated_at ON series;
CREATE TRIGGER trg_series_updated_at
BEFORE UPDATE ON series
FOR EACH ROW
EXECUTE FUNCTION set_updated_at();
