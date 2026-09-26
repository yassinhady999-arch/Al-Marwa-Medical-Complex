CREATE POLICY "admins insert roles" ON public.user_roles FOR INSERT TO authenticated WITH CHECK (public.is_admin());
CREATE POLICY "admins update roles" ON public.user_roles FOR UPDATE TO authenticated USING (public.is_admin() AND user_id <> auth.uid()) WITH CHECK (public.is_admin() AND user_id <> auth.uid());
CREATE POLICY "admins delete roles" ON public.user_roles FOR DELETE TO authenticated USING (public.is_admin() AND user_id <> auth.uid());
GRANT INSERT, UPDATE, DELETE ON public.user_roles TO authenticated;