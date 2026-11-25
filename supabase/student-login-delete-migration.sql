-- SCIENCE WORMS update: returning-student login and admin student deletion.
-- Run this ONCE in the existing Supabase project after uploading the updated website.

create or replace function public.student_login(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare s public.students;
begin
  select * into s
  from public.students
  where upper(code) = upper(trim(coalesce(p_code, '')));

  if not found then
    return null;
  end if;

  update public.students set last_active = now() where id = s.id;
  return jsonb_build_object('token', s.token, 'code', s.code);
end;
$$;

create or replace function public.admin_delete_student(p_password text, p_student_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare status text;
begin
  status := public.sw_admin_check(p_password);
  if status = 'locked' then
    return jsonb_build_object('error', 'locked');
  end if;
  if status <> 'ok' then
    return jsonb_build_object('error', 'denied');
  end if;

  delete from public.students where id = p_student_id;
  return jsonb_build_object('deleted', found);
end;
$$;

revoke all on function public.student_login(text) from public, anon, authenticated;
revoke all on function public.admin_delete_student(text, uuid) from public, anon, authenticated;
grant execute on function public.student_login(text) to anon, authenticated;
grant execute on function public.admin_delete_student(text, uuid) to anon, authenticated;
