-- #Family House — the company-wide group chat every team member lives in.
--
-- Creates a single team_chat_threads row (kind='group', name='#Family House',
-- includes_admin=true) and back-fills team_chat_participants with every
-- active team member. A trigger keeps the roster in sync: new members get
-- added automatically; deactivated members are removed so they stop seeing
-- future messages, and activated-again members are re-added.
--
-- Re-runnable: guarded by unique-name lookups and ON CONFLICT so applying
-- this migration twice is a no-op.

-- 1) Create (or reuse) the thread ---------------------------------------------
DO $$
DECLARE
    v_thread_id UUID;
BEGIN
    SELECT id INTO v_thread_id
    FROM team_chat_threads
    WHERE kind = 'group' AND name = '#Family House'
    LIMIT 1;

    IF v_thread_id IS NULL THEN
        INSERT INTO team_chat_threads (kind, name, includes_admin, created_by)
        VALUES ('group', '#Family House', TRUE, NULL)
        RETURNING id INTO v_thread_id;
    END IF;

    -- 2) Back-fill every currently-active member as a participant -------------
    INSERT INTO team_chat_participants (thread_id, team_member_id)
    SELECT v_thread_id, id
    FROM team_members
    WHERE is_active = TRUE
    ON CONFLICT (thread_id, team_member_id) DO NOTHING;
END$$;

-- 3) Keep roster in sync with is_active ---------------------------------------
CREATE OR REPLACE FUNCTION sync_family_house_membership()
RETURNS TRIGGER AS $$
DECLARE
    v_thread_id UUID;
BEGIN
    SELECT id INTO v_thread_id
    FROM team_chat_threads
    WHERE kind = 'group' AND name = '#Family House'
    LIMIT 1;

    IF v_thread_id IS NULL THEN
        RETURN NEW;
    END IF;

    -- New active member → add
    IF TG_OP = 'INSERT' AND NEW.is_active = TRUE THEN
        INSERT INTO team_chat_participants (thread_id, team_member_id)
        VALUES (v_thread_id, NEW.id)
        ON CONFLICT (thread_id, team_member_id) DO NOTHING;
        RETURN NEW;
    END IF;

    -- Reactivated → add; Deactivated → remove
    IF TG_OP = 'UPDATE' AND COALESCE(OLD.is_active, FALSE) IS DISTINCT FROM COALESCE(NEW.is_active, FALSE) THEN
        IF NEW.is_active = TRUE THEN
            INSERT INTO team_chat_participants (thread_id, team_member_id)
            VALUES (v_thread_id, NEW.id)
            ON CONFLICT (thread_id, team_member_id) DO NOTHING;
        ELSE
            DELETE FROM team_chat_participants
            WHERE thread_id = v_thread_id AND team_member_id = NEW.id;
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS family_house_member_sync ON team_members;
CREATE TRIGGER family_house_member_sync
AFTER INSERT OR UPDATE OF is_active ON team_members
FOR EACH ROW EXECUTE FUNCTION sync_family_house_membership();
