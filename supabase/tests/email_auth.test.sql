-- Email/password auth (D-032): credential storage is unreachable from API roles; RPCs are service_role only
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

select ok(not has_table_privilege('anon', 'app.user_credentials', 'select'), 'anon cannot read credentials');
select ok(not has_table_privilege('authenticated', 'app.user_credentials', 'select'), 'authenticated cannot read credentials');
select ok(not has_function_privilege('anon', 'public.auth_credentials(text)', 'execute'), 'anon cannot look up hashes');
select ok(not has_function_privilege('authenticated', 'public.auth_register(uuid,text,text,text)', 'execute'),
          'authenticated cannot register directly');

set local role service_role;
select is(public.auth_register('00000000-0000-0000-0000-0000000000e1', ' Test@Example.com ', 'T', 'scrypt$1$1$1$a$b'),
          'ok', 'register stores a new account');
select is(public.auth_register('00000000-0000-0000-0000-0000000000e2', 'test@example.com', 'T2', 'scrypt$1$1$1$a$b'),
          'email_taken', 'email is unique case-insensitively');
select public.auth_record_login('00000000-0000-0000-0000-0000000000e1', false) from generate_series(1, 5);
select ok((select locked_until > now() from public.auth_credentials('TEST@example.com')), '5 failures lock the account');
select public.auth_record_login('00000000-0000-0000-0000-0000000000e1', true);
select ok((select locked_until is null from public.auth_credentials('test@example.com')), 'a success clears the lock');

select * from finish();
rollback;
