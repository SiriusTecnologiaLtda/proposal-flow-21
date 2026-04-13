
-- Step 1: Delete scope items and attachments of duplicate projects (keep rn=1)
WITH ranked AS (
  SELECT p.id,
    ROW_NUMBER() OVER (
      PARTITION BY p.proposal_id 
      ORDER BY 
        CASE WHEN p.status = 'concluido' THEN 0 WHEN p.status = 'em_revisao' THEN 1 ELSE 2 END,
        (SELECT COUNT(*) FROM project_scope_items psi WHERE psi.project_id = p.id) DESC,
        p.created_at DESC
    ) as rn
  FROM projects p
  WHERE p.proposal_id IS NOT NULL
),
duplicates AS (
  SELECT id FROM ranked WHERE rn > 1
)
DELETE FROM project_scope_items WHERE project_id IN (SELECT id FROM duplicates);

-- Step 2: Delete attachments of duplicates
WITH ranked AS (
  SELECT p.id,
    ROW_NUMBER() OVER (
      PARTITION BY p.proposal_id 
      ORDER BY 
        CASE WHEN p.status = 'concluido' THEN 0 WHEN p.status = 'em_revisao' THEN 1 ELSE 2 END,
        (SELECT COUNT(*) FROM project_scope_items psi WHERE psi.project_id = p.id) DESC,
        p.created_at DESC
    ) as rn
  FROM projects p
  WHERE p.proposal_id IS NOT NULL
),
duplicates AS (
  SELECT id FROM ranked WHERE rn > 1
)
DELETE FROM project_attachments WHERE project_id IN (SELECT id FROM duplicates);

-- Step 3: Delete the duplicate projects themselves
WITH ranked AS (
  SELECT p.id,
    ROW_NUMBER() OVER (
      PARTITION BY p.proposal_id 
      ORDER BY 
        CASE WHEN p.status = 'concluido' THEN 0 WHEN p.status = 'em_revisao' THEN 1 ELSE 2 END,
        (SELECT COUNT(*) FROM project_scope_items psi WHERE psi.project_id = p.id) DESC,
        p.created_at DESC
    ) as rn
  FROM projects p
  WHERE p.proposal_id IS NOT NULL
),
duplicates AS (
  SELECT id FROM ranked WHERE rn > 1
)
DELETE FROM projects WHERE id IN (SELECT id FROM duplicates);

-- Step 4: Add unique constraint to prevent future duplicates
ALTER TABLE projects ADD CONSTRAINT projects_proposal_id_unique UNIQUE (proposal_id);
