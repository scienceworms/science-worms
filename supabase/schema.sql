-- SCIENCE WORMS database. Run once in Supabase > SQL Editor on a FRESH project.
-- No Supabase Auth is used. Tables are locked (RLS on, no policies, no direct grants); the website can only call the functions at the bottom.
-- Students prove who they are with a private token. The admin proves it with the admin password, checked inside the database.

create extension if not exists pgcrypto with schema extensions;
drop table if exists settings;   -- left over from older versions; held a plain-text password
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from public, anon, authenticated;

-- ===== Tables =====
create table if not exists admin_config(id int primary key check (id = 1), password_hash text not null, failed int not null default 0, locked_until timestamptz);
insert into admin_config(id, password_hash) values (1, extensions.crypt('@SCIENCE_W0RMS', extensions.gen_salt('bf'))) on conflict (id) do nothing;

create table if not exists subjects(id uuid primary key default gen_random_uuid(), name text unique not null check (length(trim(name)) > 0),
  classes int[] not null default '{6,7,8,9,10,11,12}');
create table if not exists students(id uuid primary key default gen_random_uuid(), token uuid not null unique default gen_random_uuid(), code text unique not null,
  name text not null, class_no int not null check (class_no between 6 and 12), created_at timestamptz not null default now(), last_active timestamptz not null default now());
create table if not exists notes(id uuid primary key default gen_random_uuid(), class_no int not null check (class_no between 6 and 12),
  subject_id uuid not null references subjects on delete cascade, chapter text not null, topic text not null, body text not null,
  published bool not null default false, updated_at timestamptz not null default now());
create table if not exists worksheets(id uuid primary key default gen_random_uuid(), class_no int not null check (class_no between 6 and 12),
  subject_id uuid not null references subjects on delete cascade, chapter text, title text not null, difficulty text not null default 'Medium',
  published bool not null default false, created_at timestamptz not null default now());
create table if not exists questions(id uuid primary key default gen_random_uuid(), worksheet_id uuid not null references worksheets on delete cascade,
  pos int not null, type text not null check (type in ('mcq','multi','tf','short','long','fill')), prompt text not null,
  options jsonb not null default '[]', marks numeric not null default 1 check (marks >= 0), required bool not null default true);
create table if not exists answer_keys(question_id uuid primary key references questions on delete cascade, correct jsonb, explanation text);
create table if not exists submissions(id uuid primary key default gen_random_uuid(), student_id uuid not null references students on delete cascade,
  worksheet_id uuid not null references worksheets on delete cascade, attempt int not null, answers jsonb, score numeric, max_score numeric,
  pending bool not null default false, results jsonb, submitted_at timestamptz not null default now());
create table if not exists student_progress(student_id uuid references students on delete cascade, worksheet_id uuid references worksheets on delete cascade,
  attempts int not null default 0, best_percent numeric, last_percent numeric, last_activity timestamptz not null default now(), primary key (student_id, worksheet_id));

create index if not exists idx_notes_class on notes(class_no, published);
create index if not exists idx_ws_class on worksheets(class_no, published);
create index if not exists idx_q_ws on questions(worksheet_id, pos);
create index if not exists idx_sub_student on submissions(student_id, worksheet_id);
create index if not exists idx_sub_time on submissions(submitted_at desc);
create index if not exists idx_students_class on students(class_no);

-- ===== Row Level Security: ON for every table, and NO policies, so anon/authenticated roles can read or write nothing directly =====
do $$ declare t text; p record; begin
 foreach t in array array['admin_config','subjects','students','notes','worksheets','questions','answer_keys','submissions','student_progress'] loop
  execute format('alter table %I enable row level security', t);
  for p in select policyname from pg_policies where schemaname='public' and tablename=t loop   -- removes old open_all policies if upgrading
   execute format('drop policy %I on %I', p.policyname, t);
  end loop;
 end loop; end $$;
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ===== Internal helpers (not callable from the website) =====
create or replace function sw_admin_check(p_pw text) returns text language plpgsql security definer set search_path = public, extensions as $$
declare c admin_config;
begin
 select * into c from admin_config where id = 1 for update;
 if c.locked_until is not null and c.locked_until > now() then return 'locked'; end if;
 if p_pw is not null and c.password_hash = crypt(p_pw, c.password_hash) then
  if c.failed > 0 or c.locked_until is not null then update admin_config set failed = 0, locked_until = null where id = 1; end if;
  return 'ok';
 end if;
 if c.failed + 1 >= 5 then update admin_config set failed = 0, locked_until = now() + interval '5 minutes' where id = 1;
 else update admin_config set failed = c.failed + 1 where id = 1; end if;
 return 'denied';
end $$;

create or replace function sw_save_worksheet(p_w jsonb, p_qs jsonb) returns uuid language plpgsql security definer set search_path = public as $$
declare wid uuid := coalesce((p_w->>'id')::uuid, gen_random_uuid()); q jsonb; qid uuid; i int := 0;
begin
 if length(trim(coalesce(p_w->>'title',''))) = 0 then raise exception 'Worksheet title is required'; end if;
 if jsonb_typeof(p_qs) <> 'array' or jsonb_array_length(p_qs) = 0 then raise exception 'Add at least one question'; end if;
 delete from questions where worksheet_id = wid;
 insert into worksheets(id,class_no,subject_id,chapter,title,difficulty,published)
  values (wid,(p_w->>'class_no')::int,(p_w->>'subject_id')::uuid,p_w->>'chapter',trim(p_w->>'title'),coalesce(p_w->>'difficulty','Medium'),coalesce((p_w->>'published')::bool,false))
  on conflict (id) do update set class_no=excluded.class_no, subject_id=excluded.subject_id, chapter=excluded.chapter, title=excluded.title, difficulty=excluded.difficulty, published=excluded.published;
 for q in select value from jsonb_array_elements(p_qs) loop
  i := i + 1; qid := gen_random_uuid();
  insert into questions(id,worksheet_id,pos,type,prompt,options,marks,required)
   values (qid,wid,i,q->>'type',q->>'prompt',coalesce(q->'options','[]'),coalesce((q->>'marks')::numeric,1),coalesce((q->>'required')::bool,true));
  insert into answer_keys(question_id,correct,explanation) values (qid, q->'correct', q->>'explanation');
 end loop;
 return wid;
end $$;

-- ===== Admin: ONE entry point. The password is checked on every call; wrong passwords are throttled (5 misses = 5 minute lock). =====
create or replace function admin_call(p_password text, p_action text, p_args jsonb default '{}') returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare st text; r jsonb; a jsonb := coalesce(p_args, '{}'); nr jsonb;
begin
 st := sw_admin_check(p_password);
 if st = 'locked' then return jsonb_build_object('error','locked'); end if;
 if st <> 'ok' then return jsonb_build_object('error','denied'); end if;
 case p_action
 when 'ping' then r := 'true'::jsonb;
 when 'dashboard' then
  r := jsonb_build_object('students',(select count(*) from students),'notes',(select count(*) from notes),'worksheets',(select count(*) from worksheets),'submissions',(select count(*) from submissions),
   'per_class',(select coalesce(jsonb_object_agg(class_no::text, n), '{}') from (select class_no, count(*) n from students group by class_no) t),
   'recent',(select coalesce(jsonb_agg(x), '[]') from (select st2.name, st2.class_no, w.title, b.attempt, b.score, b.max_score, b.pending, b.submitted_at
      from submissions b join students st2 on st2.id = b.student_id join worksheets w on w.id = b.worksheet_id order by b.submitted_at desc limit 8) x));
 when 'subjects_list' then
  r := (select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'classes',classes) order by name), '[]') from subjects);
 when 'subject_add' then
  if length(trim(coalesce(a->>'name',''))) = 0 or jsonb_typeof(a->'classes') <> 'array' or jsonb_array_length(a->'classes') = 0 then raise exception 'Enter a subject name and choose classes'; end if;
  insert into subjects(name, classes) values (trim(a->>'name'), array(select jsonb_array_elements_text(a->'classes')::int));
  r := 'true'::jsonb;
 when 'subject_delete' then delete from subjects where id = (a->>'id')::uuid; r := 'true'::jsonb;
 when 'notes_list' then
  r := (select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'class_no',n.class_no,'chapter',n.chapter,'topic',n.topic,'published',n.published,'subject',s.name) order by n.class_no, n.chapter, n.topic), '[]')
        from notes n join subjects s on s.id = n.subject_id);
 when 'note_get' then r := (select to_jsonb(n) from notes n where n.id = (a->>'id')::uuid);
 when 'note_save' then
  nr := a->'row';
  if length(trim(coalesce(nr->>'topic','')||coalesce(nr->>'chapter',''))) = 0 or length(coalesce(nr->>'body','')) = 0 then raise exception 'Subject, chapter, topic and notes are required'; end if;
  if a->>'id' is null then
   insert into notes(class_no,subject_id,chapter,topic,body,published) values ((nr->>'class_no')::int,(nr->>'subject_id')::uuid,trim(nr->>'chapter'),trim(nr->>'topic'),nr->>'body',coalesce((nr->>'published')::bool,false));
  else
   update notes set class_no=(nr->>'class_no')::int, subject_id=(nr->>'subject_id')::uuid, chapter=trim(nr->>'chapter'), topic=trim(nr->>'topic'), body=nr->>'body',
     published=coalesce((nr->>'published')::bool,false), updated_at=now() where id=(a->>'id')::uuid;
  end if;
  r := 'true'::jsonb;
 when 'note_toggle' then update notes set published = (a->>'published')::bool, updated_at = now() where id = (a->>'id')::uuid; r := 'true'::jsonb;
 when 'note_delete' then delete from notes where id = (a->>'id')::uuid; r := 'true'::jsonb;
 when 'ws_list' then
  r := (select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'title',w.title,'class_no',w.class_no,'chapter',w.chapter,'difficulty',w.difficulty,'published',w.published,'subject',s.name,
        'questions',(select count(*) from questions q where q.worksheet_id = w.id)) order by w.created_at desc), '[]') from worksheets w join subjects s on s.id = w.subject_id);
 when 'ws_get' then
  r := (select jsonb_build_object('w', to_jsonb(w), 'qs', (select coalesce(jsonb_agg(jsonb_build_object('type',q.type,'prompt',q.prompt,'options',q.options,'marks',q.marks,'required',q.required,
        'correct',k.correct,'explanation',coalesce(k.explanation,'')) order by q.pos), '[]') from questions q left join answer_keys k on k.question_id = q.id where q.worksheet_id = w.id))
        from worksheets w where w.id = (a->>'id')::uuid);
 when 'ws_save' then r := to_jsonb(sw_save_worksheet(a->'w', a->'qs'));
 when 'ws_toggle' then update worksheets set published = (a->>'published')::bool where id = (a->>'id')::uuid; r := 'true'::jsonb;
 when 'ws_delete' then delete from worksheets where id = (a->>'id')::uuid; r := 'true'::jsonb;
 when 'students_list' then
  r := (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'class_no',s.class_no,'code',s.code,'last_active',s.last_active,'created_at',s.created_at,
        'progress',(select coalesce(jsonb_agg(jsonb_build_object('title',w.title,'attempts',p.attempts,'best',p.best_percent,'last',p.last_percent)), '[]')
                    from student_progress p join worksheets w on w.id = p.worksheet_id where p.student_id = s.id)) order by s.last_active desc), '[]')
        from (select * from students order by last_active desc limit 2000) s);
 when 'change_password' then
  if length(coalesce(a->>'new','')) < 8 then raise exception 'New password must be at least 8 characters'; end if;
  update admin_config set password_hash = crypt(a->>'new', gen_salt('bf')) where id = 1; r := 'true'::jsonb;
 else raise exception 'Unknown action';
 end case;
 return jsonb_build_object('data', r);
end $$;

-- ===== Student functions: every one is scoped to the student's own token and class =====
create or replace function student_register(p_name text, p_class int) returns jsonb language plpgsql security definer set search_path = public as $$
declare s students; c text;
begin
 if length(trim(coalesce(p_name,''))) < 2 or length(trim(p_name)) > 60 or p_class is null or p_class not between 6 and 12 then raise exception 'Enter your name and class'; end if;
 loop
  c := 'SW-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 5));
  begin insert into students(code,name,class_no) values (c, trim(p_name), p_class) returning * into s; exit;
  exception when unique_violation then null; end;
 end loop;
 return jsonb_build_object('token', s.token, 'code', s.code);
end $$;

create or replace function student_me(p_token uuid) returns jsonb language plpgsql security definer set search_path = public as $$
declare s students;
begin
 select * into s from students where token = p_token; if not found then return null; end if;
 update students set last_active = now() where id = s.id;
 return jsonb_build_object('name',s.name,'class_no',s.class_no,'code',s.code,
  'total',(select count(*) from worksheets w where w.published and w.class_no = s.class_no),
  'completed',(select count(distinct worksheet_id) from submissions where student_id = s.id),
  'attempts',(select count(*) from submissions where student_id = s.id),
  'avg',(select round(avg(p)) from (select max(score / nullif(max_score,0) * 100) p from submissions where student_id = s.id group by worksheet_id) t),
  'recent',(select coalesce(jsonb_agg(x), '[]') from (select w.title,b.attempt,b.score,b.max_score,b.pending,b.submitted_at
     from submissions b join worksheets w on w.id = b.worksheet_id where b.student_id = s.id order by b.submitted_at desc limit 5) x));
end $$;

create or replace function student_notes(p_token uuid) returns jsonb language sql security definer stable set search_path = public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',n.id,'subject',sb.name,'chapter',n.chapter,'topic',n.topic,'body',n.body) order by sb.name, n.chapter, n.topic), '[]')
 from notes n join subjects sb on sb.id = n.subject_id join students s on s.token = p_token and s.class_no = n.class_no where n.published
$$;

create or replace function student_worksheets(p_token uuid) returns jsonb language sql security definer stable set search_path = public as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'title',w.title,'subject',sb.name,'chapter',w.chapter,'difficulty',w.difficulty,
  'questions',(select count(*) from questions q where q.worksheet_id = w.id),
  'marks',(select coalesce(sum(marks),0) from questions q where q.worksheet_id = w.id),
  'attempts',(select count(*) from submissions b where b.worksheet_id = w.id and b.student_id = s.id),
  'best',(select round(max(score / nullif(max_score,0) * 100)) from submissions b where b.worksheet_id = w.id and b.student_id = s.id)) order by sb.name, w.created_at), '[]')
 from worksheets w join subjects sb on sb.id = w.subject_id join students s on s.token = p_token and s.class_no = w.class_no where w.published
$$;

-- Returns questions WITHOUT answer keys.
create or replace function student_worksheet(p_token uuid, p_id uuid) returns jsonb language sql security definer stable set search_path = public as $$
 select jsonb_build_object('title',w.title,'chapter',w.chapter,'difficulty',w.difficulty,'questions',
  (select coalesce(jsonb_agg(jsonb_build_object('id',q.id,'type',q.type,'prompt',q.prompt,'options',q.options,'marks',q.marks,'required',q.required) order by q.pos), '[]')
   from questions q where q.worksheet_id = w.id))
 from worksheets w join students s on s.token = p_token and s.class_no = w.class_no where w.id = p_id and w.published
$$;

-- Grades on the server. The answer key is returned only AFTER the submission has been stored.
create or replace function student_submit(p_token uuid, p_id uuid, p_answers jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare s students; w worksheets; q record; a jsonb; got numeric; sc numeric := 0; mx numeric := 0; pend bool := false; qp bool;
 res jsonb := '{}'; keys jsonb := '{}'; n int; c int; i int; att int;
begin
 select * into s from students where token = p_token; if not found then raise exception 'Please log in again'; end if;
 select * into w from worksheets where id = p_id and published and class_no = s.class_no; if not found then raise exception 'Worksheet not available'; end if;
 if p_answers is null or jsonb_typeof(p_answers) <> 'object' then raise exception 'Invalid answers'; end if;
 for q in select qs.*, k.correct, k.explanation from questions qs left join answer_keys k on k.question_id = qs.id where qs.worksheet_id = p_id order by qs.pos loop
  a := p_answers -> (q.id::text); got := 0; qp := false; mx := mx + q.marks;
  if q.required and (a is null or a = '""'::jsonb or a = '[]'::jsonb or a = 'null'::jsonb) then raise exception 'Please answer all required questions'; end if;
  if q.type in ('mcq','tf') then
   if a is not null and a = q.correct then got := q.marks; end if;
  elsif q.type = 'multi' then
   if a is not null and jsonb_typeof(a) = 'array' and (select coalesce(jsonb_agg(x order by x), '[]') from jsonb_array_elements(a) x)
      = (select coalesce(jsonb_agg(x order by x), '[]') from jsonb_array_elements(q.correct) x) then got := q.marks; end if;
  elsif q.type = 'fill' then
   n := greatest(jsonb_array_length(q.correct), 1); c := 0;
   if a is not null and jsonb_typeof(a) = 'array' then
    for i in 0 .. n - 1 loop
     if lower(trim(coalesce(a->>i,''))) = any (select trim(z) from unnest(string_to_array(lower(q.correct->>i), '|')) z) then c := c + 1; end if;
    end loop;
   end if;
   got := q.marks * c / n;
  else
   if coalesce(trim(a #>> '{}'), '') <> '' then qp := true; pend := true; end if;
  end if;
  if not qp then sc := sc + got; end if;
  res := res || jsonb_build_object(q.id::text, jsonb_build_object('got', case when qp then null else got end, 'max', q.marks, 'pending', qp));
  keys := keys || jsonb_build_object(q.id::text, jsonb_build_object('correct', q.correct, 'explanation', q.explanation));
 end loop;
 select coalesce(max(attempt), 0) + 1 into att from submissions where student_id = s.id and worksheet_id = p_id;
 insert into submissions(student_id,worksheet_id,attempt,answers,score,max_score,pending,results) values (s.id, p_id, att, p_answers, sc, mx, pend, res);
 insert into student_progress(student_id,worksheet_id,attempts,best_percent,last_percent)
  values (s.id, p_id, 1, case when mx > 0 then sc / mx * 100 end, case when mx > 0 then sc / mx * 100 end)
  on conflict (student_id, worksheet_id) do update set attempts = student_progress.attempts + 1, last_percent = excluded.last_percent,
   best_percent = greatest(student_progress.best_percent, excluded.best_percent), last_activity = now();
 update students set last_active = now() where id = s.id;
 return jsonb_build_object('score',sc,'max',mx,'pending',pend,'attempt',att,'results',res,'keys',keys);
end $$;

create or replace function student_history(p_token uuid) returns jsonb language sql security definer stable set search_path = public as $$
 select coalesce(jsonb_agg(jsonb_build_object('title',w.title,'attempt',b.attempt,'score',b.score,'max',b.max_score,'pending',b.pending,'at',b.submitted_at) order by b.submitted_at desc), '[]')
 from submissions b join students s on s.id = b.student_id and s.token = p_token join worksheets w on w.id = b.worksheet_id
$$;

-- ===== Returning-student login and admin student deletion =====
create or replace function student_login(p_code text) returns jsonb language plpgsql security definer set search_path = public as $$
declare s students;
begin
 select * into s from students where upper(code) = upper(trim(coalesce(p_code,'')));
 if not found then return null; end if;
 update students set last_active = now() where id = s.id;
 return jsonb_build_object('token',s.token,'code',s.code);
end $$;

create or replace function admin_delete_student(p_password text, p_student_id uuid) returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare status text;
begin
 status := sw_admin_check(p_password);
 if status = 'locked' then return jsonb_build_object('error','locked'); end if;
 if status <> 'ok' then return jsonb_build_object('error','denied'); end if;
 delete from students where id = p_student_id;
 return jsonb_build_object('deleted',found);
end $$;

-- ===== Function permissions (explicit). Everything is revoked first, then only these 8 are opened to the website. =====
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on function student_register(text, int)        to anon, authenticated;
grant execute on function student_login(text)                to anon, authenticated;
grant execute on function admin_delete_student(text, uuid)  to anon, authenticated;
grant execute on function student_me(uuid)                   to anon, authenticated;
grant execute on function student_notes(uuid)                to anon, authenticated;
grant execute on function student_worksheets(uuid)           to anon, authenticated;
grant execute on function student_worksheet(uuid, uuid)      to anon, authenticated;
grant execute on function student_submit(uuid, uuid, jsonb)  to anon, authenticated;
grant execute on function student_history(uuid)              to anon, authenticated;
grant execute on function admin_call(text, text, jsonb)      to anon, authenticated;
