import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type Admin = SupabaseClient<Database>;

const STAFF_ROLES = ["admin", "receptionist", "doctor", "viewer"] as const;

async function getAdmin(): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as Admin;
}

/** Throws if the calling user is not an owner/admin. */
async function assertAdmin(ctx: { supabase: Admin; userId: string }): Promise<void> {
  const { data, error } = await ctx.supabase.rpc("is_admin");
  if (error) throw new Error(error.message);
  if (!data) throw new Error("هذه العملية متاحة للمدير فقط");
}

const sectionsSchema = z.record(z.boolean());

const createSchema = z.object({
  email: z.string().email("بريد إلكتروني غير صحيح"),
  password: z.string().min(6, "كلمة المرور 6 أحرف على الأقل"),
  fullName: z.string().min(2, "الاسم مطلوب"),
  phone: z.string().trim().optional().default(""),
  role: z.enum(STAFF_ROLES),
  sections: sectionsSchema.default({}),
});

export const createStaffFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.input<typeof createSchema>) => createSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const admin = await getAdmin();

    const { data: created, error } = await admin.auth.admin.createUser({
      email: data.email.trim().toLowerCase(),
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName.trim() },
    });
    if (error || !created.user) {
      const msg = (error?.message ?? "").toLowerCase();
      if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
        throw new Error("هذا البريد الإلكتروني مستخدم بالفعل");
      }
      throw new Error(error?.message ?? "تعذّر إنشاء الحساب");
    }

    const userId = created.user.id;

    // handle_new_user() already created a profile + default role row. Align them.
    await admin
      .from("profiles")
      .update({
        full_name: data.fullName.trim(),
        phone: data.phone.trim() || null,
        is_active: true,
      })
      .eq("id", userId);

    await admin.from("user_roles").delete().eq("user_id", userId);
    await admin.from("user_roles").insert({ user_id: userId, role: data.role });

    await admin.from("staff_permissions").upsert({
      user_id: userId,
      sections: data.sections,
      updated_by: context.userId,
    });

    await context.supabase.rpc("log_activity", {
      _action: "create",
      _section: "staff",
      _description: `إنشاء حساب موظف: ${data.fullName.trim()} (${data.email.trim()})`,
      _entity_type: "staff",
      _entity_id: userId,
      _metadata: { role: data.role },
    });

    return { userId };
  });

const updateSchema = z.object({
  userId: z.string().uuid(),
  fullName: z.string().min(2).optional(),
  phone: z.string().trim().optional(),
  role: z.enum(STAFF_ROLES).optional(),
  sections: sectionsSchema.optional(),
  isActive: z.boolean().optional(),
});

export const updateStaffFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.input<typeof updateSchema>) => updateSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const admin = await getAdmin();

    if (data.userId === context.userId && (data.role || data.isActive === false)) {
      throw new Error("لا يمكنك تعديل دورك أو إيقاف حسابك بنفسك");
    }

    const profilePatch: { full_name?: string; phone?: string | null; is_active?: boolean } = {};
    if (data.fullName !== undefined) profilePatch.full_name = data.fullName.trim();
    if (data.phone !== undefined) profilePatch.phone = data.phone.trim() || null;
    if (data.isActive !== undefined) profilePatch.is_active = data.isActive;
    if (Object.keys(profilePatch).length > 0) {
      await admin.from("profiles").update(profilePatch).eq("id", data.userId);
    }

    if (data.role) {
      await admin.from("user_roles").delete().eq("user_id", data.userId);
      await admin.from("user_roles").insert({ user_id: data.userId, role: data.role });
    }

    if (data.sections) {
      await admin.from("staff_permissions").upsert({
        user_id: data.userId,
        sections: data.sections,
        updated_by: context.userId,
      });
    }

    if (data.isActive !== undefined) {
      await admin.auth.admin.updateUserById(data.userId, {
        ban_duration: data.isActive ? "none" : "876000h",
      });
    }

    const changes: string[] = [];
    if (data.fullName !== undefined) changes.push("الاسم");
    if (data.phone !== undefined) changes.push("الجوال");
    if (data.role) changes.push(`الدور → ${data.role}`);
    if (data.sections) changes.push("الصلاحيات");
    if (data.isActive !== undefined) changes.push(data.isActive ? "تفعيل الحساب" : "إيقاف الحساب");

    await context.supabase.rpc("log_activity", {
      _action:
        data.isActive === false
          ? "deactivate"
          : data.isActive === true
            ? "activate"
            : data.sections
              ? "permissions_change"
              : "update",
      _section: "staff",
      _description: `تعديل موظف: ${changes.join("، ") || "بيانات"}`,
      _entity_type: "staff",
      _entity_id: data.userId,
      _metadata: {},
    });

    return { ok: true };
  });

const passwordSchema = z.object({
  userId: z.string().uuid(),
  password: z.string().min(6, "كلمة المرور 6 أحرف على الأقل"),
});

export const resetStaffPasswordFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.input<typeof passwordSchema>) => passwordSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const admin = await getAdmin();

    const { error } = await admin.auth.admin.updateUserById(data.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);

    await context.supabase.rpc("log_activity", {
      _action: "password_reset",
      _section: "staff",
      _description: "إعادة تعيين كلمة مرور موظف",
      _entity_type: "staff",
      _entity_id: data.userId,
      _metadata: {},
    });

    return { ok: true };
  });

const deleteSchema = z.object({ userId: z.string().uuid() });

export const deleteStaffFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data: z.input<typeof deleteSchema>) => deleteSchema.parse(data))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    if (data.userId === context.userId) throw new Error("لا يمكنك حذف حسابك");
    const admin = await getAdmin();

    // Snapshot the name before the row disappears, for the log entry.
    const { data: prof } = await admin
      .from("profiles")
      .select("full_name, email")
      .eq("id", data.userId)
      .maybeSingle();

    const { error } = await admin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);

    await context.supabase.rpc("log_activity", {
      _action: "delete",
      _section: "staff",
      _description: `حذف حساب موظف: ${prof?.full_name || prof?.email || data.userId}`,
      _entity_type: "staff",
      _entity_id: data.userId,
      _metadata: {},
    });

    return { ok: true };
  });
