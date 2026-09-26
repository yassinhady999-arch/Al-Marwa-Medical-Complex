import { supabase } from "@/integrations/supabase/client";
import type { SectionKey } from "@/lib/access";
import type { Json } from "@/integrations/supabase/types";

type LogInput = {
  action: string;
  section: SectionKey;
  description?: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, unknown>;
};

/**
 * Records an entry in the activity log for the current user.
 * Fire-and-forget: failures are swallowed so they never break the action that triggered them.
 */
export async function logActivity(input: LogInput): Promise<void> {
  try {
    const args: {
      _action: string;
      _section: string;
      _description: string;
      _metadata: Json;
      _entity_type?: string;
      _entity_id?: string;
    } = {
      _action: input.action,
      _section: input.section,
      _description: input.description ?? "",
      _metadata: (input.metadata ?? {}) as Json,
    };
    if (input.entityType) args._entity_type = input.entityType;
    if (input.entityId) args._entity_id = input.entityId;

    await supabase.rpc("log_activity", args);
  } catch (e) {
    console.warn("[activity] failed to log", e);
  }
}
