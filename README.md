# SCIENCE WORMS – setup guide

Static website (HTML, CSS, JavaScript) plus Supabase **as a database only**. No Supabase Authentication, no email login.

## 1. Create a fresh Supabase project
supabase.com > **New project**. Wait until it is ready. (If you already used an older schema, create a NEW project instead of reusing the old one.)

## 2. Replace the old schema with the new one
1. Open **SQL Editor > New query**.
2. Paste the entire contents of `supabase/schema.sql` and click **Run**. It should finish with "Success".
3. Do not run any older schema file. The old schema had open policies that allowed anyone to read and change everything.

## 3. Connect the website
Open `js/config.js` and fill in `SUPABASE_URL` and `SUPABASE_ANON_KEY` (Project Settings > API, the `anon` / publishable key). Never put the `service_role` key in any file.

## 4. Admin password
Initial password: `@SCIENCE_W0RMS` (set inside `schema.sql`, stored in the database only as a hash). It is no longer in `config.js`.
Log in at `admin.html`, then use **Settings > Change admin password**. Do this on day one, because the initial password appears in `schema.sql` and in your repository if you upload it.
After 5 wrong attempts the admin login is locked for 5 minutes.

## 5. Run locally
In the folder run `python3 -m http.server 8000` and open http://localhost:8000.

## 6. Publish
- **Netlify:** app.netlify.com/drop, drag the folder in.
- **GitHub Pages:** upload the files, then Settings > Pages > deploy from the `main` branch root.

## What is protected, and what is not
- All tables have Row Level Security on and no policies, and direct access is revoked from the public roles. The website can only call 8 database functions.
- Students call functions with their own private token. They can read only published notes and worksheets for their own class, and only their own results. Answer keys are never sent before a submission is saved, and grading happens in the database.
- Admin actions all go through one function that checks the admin password on every call. Wrong guesses are throttled.
- This is NOT full security. There are no real user accounts. Anyone who guesses or learns the admin password has full admin power. Anyone can register as a student, and student identity is only a name, class and browser token. The password is sent from the browser to the database, so use HTTPS (Netlify and GitHub Pages provide it) and a long password. A 5-failure lockout can also be triggered by a stranger to lock you out for 5 minutes. Do not store sensitive personal data.

## Features
Admin: Subjects, Notes (editor, preview, publish, edit, delete), Worksheets (six question types, marks, explanations, edit, publish, delete), Students (search, class filter, scores, last activity), Settings.
Student: name and class login, notes, worksheets, results and previous attempts. Answers stay hidden until submission, then Show/Hide Answer and Show/Hide All Answers work.

## Testing status
The JavaScript was syntax-checked and the code was cross-checked against the SQL (every function the website calls exists and is granted, and every admin action exists). The SQL has NOT been run on a real Postgres or Supabase database, and the website has NOT been tested in a browser. Run it once and report any error.

## Update: returning student login and student deletion

This version adds a returning-student login using the Student ID issued at registration, plus an admin-only Delete Student action. Student deletion also removes that student's submissions and progress because the database foreign keys use `ON DELETE CASCADE`.

### Existing Supabase project
If you already ran the original `schema.sql`, do **not** run the full schema again. Run `supabase/student-login-delete-migration.sql` once in Supabase SQL Editor. Then upload the updated website files.

### Student IDs
New students receive an ID such as `SW-A1B2C`. They must save it and keep it private. A Student ID acts like a sign-in credential in this passwordless design. If it is lost, an administrator can find it in the Students section.

### Configuration
Before using this ZIP, restore your own Supabase Project URL and Publishable key in `js/config.js`. Do not put a Supabase Secret/service_role key in frontend files.
