drop function if exists public.save_war_room_sync(text, text, jsonb);
drop function if exists public.read_war_room_sync(text, text);

drop policy if exists "Read authorized sync vault" on public.war_room_sync_vaults;
drop policy if exists "Create authorized sync vault" on public.war_room_sync_vaults;
drop policy if exists "Update authorized sync vault" on public.war_room_sync_vaults;

create or replace function public.prepare_war_room_sync_vault()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_headers jsonb := coalesce(
    nullif(current_setting('request.headers', true), ''),
    '{}'
  )::jsonb;
  v_secret text := coalesce(v_headers ->> 'x-vault-secret', '');
begin
  if length(v_secret) < 40 or length(v_secret) > 100 then
    raise exception 'invalid secure sync authorization';
  end if;

  delete from public.war_room_sync_vaults
  where expires_at <= now();

  if tg_op = 'INSERT'
    and not exists (
      select 1
      from public.war_room_sync_vaults
      where vault_id = new.vault_id
    )
    and (
      select count(*)
      from public.war_room_sync_vaults
    ) >= 500 then
    raise exception 'secure sync capacity reached';
  end if;

  new.secret_hash := encode(extensions.digest(v_secret, 'sha256'), 'hex');
  new.updated_at := now();
  new.expires_at := now() + interval '18 months';
  return new;
end;
$$;

revoke all on function public.prepare_war_room_sync_vault() from public;
revoke all on function public.prepare_war_room_sync_vault() from anon, authenticated;

drop trigger if exists prepare_war_room_sync_vault
on public.war_room_sync_vaults;

create trigger prepare_war_room_sync_vault
before insert or update on public.war_room_sync_vaults
for each row execute function public.prepare_war_room_sync_vault();

create policy "Read authorized sync vault"
on public.war_room_sync_vaults
for select
to anon
using (
  expires_at > now()
  and secret_hash = encode(
    extensions.digest(
      coalesce(
        nullif(
          (select current_setting('request.headers', true)),
          ''
        )::jsonb
          ->> 'x-vault-secret',
        ''
      ),
      'sha256'
    ),
    'hex'
  )
);

create policy "Create authorized sync vault"
on public.war_room_sync_vaults
for insert
to anon
with check (
  expires_at > now()
  and secret_hash = encode(
    extensions.digest(
      coalesce(
        nullif(
          (select current_setting('request.headers', true)),
          ''
        )::jsonb
          ->> 'x-vault-secret',
        ''
      ),
      'sha256'
    ),
    'hex'
  )
);

create policy "Update authorized sync vault"
on public.war_room_sync_vaults
for update
to anon
using (
  expires_at > now()
  and secret_hash = encode(
    extensions.digest(
      coalesce(
        nullif(
          (select current_setting('request.headers', true)),
          ''
        )::jsonb
          ->> 'x-vault-secret',
        ''
      ),
      'sha256'
    ),
    'hex'
  )
)
with check (
  expires_at > now()
  and secret_hash = encode(
    extensions.digest(
      coalesce(
        nullif(
          (select current_setting('request.headers', true)),
          ''
        )::jsonb
          ->> 'x-vault-secret',
        ''
      ),
      'sha256'
    ),
    'hex'
  )
);

revoke all on table public.war_room_sync_vaults from anon, authenticated;
grant select, insert, update on table public.war_room_sync_vaults to anon;
