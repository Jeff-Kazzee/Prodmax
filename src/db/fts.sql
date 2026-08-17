-- Prodmax unified FTS5 index (architecture §2.10) + sync triggers.
-- Applied idempotently by scripts/migrate.mjs and tests/db createTestDb().
--
-- Content policy (§2.10):
--   issues   → title + description_md + issue comments appended into body
--   pages    → title + concatenated block `text`
--   projects → name + description_md
-- Rank = bm25() (title weighted 10:1) + recency boost (7-day bucket on the
-- unindexed updated_at column) + exact-title boost; see src/db/fts.ts.

CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  title,
  body,
  entity_type UNINDEXED,
  entity_id UNINDEXED,
  workspace_id UNINDEXED,
  updated_at UNINDEXED,
  tokenize = 'porter unicode61'
);

-- ---------------------------------------------------------------- issues

CREATE TRIGGER IF NOT EXISTS fts_issues_ai AFTER INSERT ON issues BEGIN
  INSERT INTO search_fts(title, body, entity_type, entity_id, workspace_id, updated_at)
  VALUES (new.title, COALESCE(new.description_md, ''), 'issue', new.id, new.workspace_id, new.updated_at);
END;

CREATE TRIGGER IF NOT EXISTS fts_issues_au AFTER UPDATE OF title, description_md, workspace_id, updated_at, deleted_at ON issues BEGIN
  DELETE FROM search_fts WHERE entity_type = 'issue' AND entity_id = new.id;
  INSERT INTO search_fts(title, body, entity_type, entity_id, workspace_id, updated_at)
  VALUES (
    new.title,
    COALESCE(new.description_md, '') || COALESCE((
      SELECT ' ' || group_concat(c.body_md, ' ') FROM comments c
      WHERE c.entity_type = 'issue' AND c.entity_id = new.id AND c.deleted_at IS NULL
    ), ''),
    'issue', new.id, new.workspace_id, new.updated_at
  );
END;

CREATE TRIGGER IF NOT EXISTS fts_issues_ad AFTER DELETE ON issues BEGIN
  DELETE FROM search_fts WHERE entity_type = 'issue' AND entity_id = old.id;
END;

-- ------------------------------------------------- comments (issue bodies)

CREATE TRIGGER IF NOT EXISTS fts_issue_comments_ai AFTER INSERT ON comments WHEN new.entity_type = 'issue' BEGIN
  DELETE FROM search_fts WHERE entity_type = 'issue' AND entity_id = new.entity_id;
  INSERT INTO search_fts(title, body, entity_type, entity_id, workspace_id, updated_at)
  SELECT i.title,
         COALESCE(i.description_md, '') || COALESCE((
           SELECT ' ' || group_concat(c.body_md, ' ') FROM comments c
           WHERE c.entity_type = 'issue' AND c.entity_id = i.id AND c.deleted_at IS NULL
         ), ''),
         'issue', i.id, i.workspace_id, i.updated_at
  FROM issues i WHERE i.id = new.entity_id;
END;

CREATE TRIGGER IF NOT EXISTS fts_issue_comments_au AFTER UPDATE OF body_md, deleted_at, entity_id, entity_type ON comments WHEN new.entity_type = 'issue' BEGIN
  DELETE FROM search_fts WHERE entity_type = 'issue' AND entity_id IN (new.entity_id, old.entity_id);
  INSERT INTO search_fts(title, body, entity_type, entity_id, workspace_id, updated_at)
  SELECT i.title,
         COALESCE(i.description_md, '') || COALESCE((
           SELECT ' ' || group_concat(c.body_md, ' ') FROM comments c
           WHERE c.entity_type = 'issue' AND c.entity_id = i.id AND c.deleted_at IS NULL
         ), ''),
         'issue', i.id, i.workspace_id, i.updated_at
  FROM issues i WHERE i.id = new.entity_id;
END;

CREATE TRIGGER IF NOT EXISTS fts_issue_comments_ad AFTER DELETE ON comments WHEN old.entity_type = 'issue' BEGIN
  DELETE FROM search_fts WHERE entity_type = 'issue' AND entity_id = old.entity_id;
  INSERT INTO search_fts(title, body, entity_type, entity_id, workspace_id, updated_at)
  SELECT i.title,
         COALESCE(i.description_md, '') || COALESCE((
           SELECT ' ' || group_concat(c.body_md, ' ') FROM comments c
           WHERE c.entity_type = 'issue' AND c.entity_id = i.id AND c.deleted_at IS NULL
         ), ''),
         'issue', i.id, i.workspace_id, i.updated_at
  FROM issues i WHERE i.id = old.entity_id;
END;

-- ------------------------------------------------------------------ pages

CREATE TRIGGER IF NOT EXISTS fts_pages_ai AFTER INSERT ON pages BEGIN
  INSERT INTO search_fts(title, body, entity_type, entity_id, workspace_id, updated_at)
  SELECT new.title, COALESCE((
    SELECT group_concat(b.text, ' ') FROM blocks b
    WHERE b.page_id = new.id AND b.deleted_at IS NULL
  ), ''), 'page', new.id, new.workspace_id, new.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS fts_pages_au AFTER UPDATE OF title, workspace_id, updated_at, deleted_at ON pages BEGIN
  DELETE FROM search_fts WHERE entity_type = 'page' AND entity_id = new.id;
  INSERT INTO search_fts(title, body, entity_type, entity_id, workspace_id, updated_at)
  SELECT new.title, COALESCE((
    SELECT group_concat(b.text, ' ') FROM blocks b
    WHERE b.page_id = new.id AND b.deleted_at IS NULL
  ), ''), 'page', new.id, new.workspace_id, new.updated_at;
END;

CREATE TRIGGER IF NOT EXISTS fts_pages_ad AFTER DELETE ON pages BEGIN
  DELETE FROM search_fts WHERE entity_type = 'page' AND entity_id = old.id;
END;

-- ------------------------------------------- blocks (page body maintenance)

CREATE TRIGGER IF NOT EXISTS fts_blocks_ai AFTER INSERT ON blocks BEGIN
  DELETE FROM search_fts WHERE entity_type = 'page' AND entity_id = new.page_id;
  INSERT INTO search_fts(title, body, entity_type, entity_id, workspace_id, updated_at)
  SELECT p.title, COALESCE((
    SELECT group_concat(b.text, ' ') FROM blocks b
    WHERE b.page_id = p.id AND b.deleted_at IS NULL
  ), ''), 'page', p.id, p.workspace_id, p.updated_at
  FROM pages p WHERE p.id = new.page_id;
END;

CREATE TRIGGER IF NOT EXISTS fts_blocks_au AFTER UPDATE OF text, page_id, workspace_id, deleted_at ON blocks BEGIN
  DELETE FROM search_fts WHERE entity_type = 'page' AND entity_id IN (new.page_id, old.page_id);
  INSERT INTO search_fts(title, body, entity_type, entity_id, workspace_id, updated_at)
  SELECT p.title, COALESCE((
    SELECT group_concat(b.text, ' ') FROM blocks b
    WHERE b.page_id = p.id AND b.deleted_at IS NULL
  ), ''), 'page', p.id, p.workspace_id, p.updated_at
  FROM pages p WHERE p.id IN (new.page_id, old.page_id);
END;

CREATE TRIGGER IF NOT EXISTS fts_blocks_ad AFTER DELETE ON blocks BEGIN
  DELETE FROM search_fts WHERE entity_type = 'page' AND entity_id = old.page_id;
  INSERT INTO search_fts(title, body, entity_type, entity_id, workspace_id, updated_at)
  SELECT p.title, COALESCE((
    SELECT group_concat(b.text, ' ') FROM blocks b
    WHERE b.page_id = p.id AND b.deleted_at IS NULL
  ), ''), 'page', p.id, p.workspace_id, p.updated_at
  FROM pages p WHERE p.id = old.page_id;
END;

-- --------------------------------------------------------------- projects

CREATE TRIGGER IF NOT EXISTS fts_projects_ai AFTER INSERT ON projects BEGIN
  INSERT INTO search_fts(title, body, entity_type, entity_id, workspace_id, updated_at)
  VALUES (new.name, COALESCE(new.description_md, ''), 'project', new.id, new.workspace_id, new.updated_at);
END;

CREATE TRIGGER IF NOT EXISTS fts_projects_au AFTER UPDATE OF name, description_md, workspace_id, updated_at, deleted_at ON projects BEGIN
  DELETE FROM search_fts WHERE entity_type = 'project' AND entity_id = new.id;
  INSERT INTO search_fts(title, body, entity_type, entity_id, workspace_id, updated_at)
  VALUES (new.name, COALESCE(new.description_md, ''), 'project', new.id, new.workspace_id, new.updated_at);
END;

CREATE TRIGGER IF NOT EXISTS fts_projects_ad AFTER DELETE ON projects BEGIN
  DELETE FROM search_fts WHERE entity_type = 'project' AND entity_id = old.id;
END;
