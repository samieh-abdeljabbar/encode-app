ALTER TABLE chapters ADD COLUMN raw_markdown TEXT NOT NULL DEFAULT '';

UPDATE chapters
SET raw_markdown = COALESCE(
    (
        SELECT GROUP_CONCAT(part, char(10) || char(10))
        FROM (
            SELECT CASE
                WHEN heading IS NOT NULL AND heading != ''
                    THEN '## ' || heading || char(10) || char(10) || body_markdown
                ELSE body_markdown
            END AS part
            FROM chapter_sections
            WHERE chapter_id = chapters.id
            ORDER BY section_index
        )
    ),
    ''
);
