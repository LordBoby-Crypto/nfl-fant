create extension if not exists pgcrypto with schema extensions;

create table if not exists public.war_room_sync_vaults (
  vault_id text primary key,
  secret_hash text not null,
  envelope jsonb not null,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '18 months'),
  constraint valid_war_room_vault_id
    check (vault_id ~ '^[A-Za-z0-9_-]{20,32}$'),
  constraint bounded_war_room_envelope
    check (octet_length(envelope::text) <= 100000)
);

alter table public.war_room_sync_vaults enable row level security;
revoke all on table public.war_room_sync_vaults from anon, authenticated;

create or replace function public.save_war_room_sync(
  p_vault_id text,
  p_secret text,
  p_envelope jsonb
)
returns table(updated_at timestamptz)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_secret_hash text;
  v_updated_at timestamptz;
  v_rows integer;
begin
  if p_vault_id !~ '^[A-Za-z0-9_-]{20,32}$'
    or length(p_secret) < 40
    or length(p_secret) > 100
    or p_envelope is null
    or (p_envelope ->> 'version') <> '1'
    or octet_length(p_envelope::text) > 100000 then
    raise exception 'invalid secure sync request';
  end if;

  v_secret_hash := encode(extensions.digest(p_secret, 'sha256'), 'hex');

  delete from public.war_room_sync_vaults
  where expires_at <= now();

  insert into public.war_room_sync_vaults as vault (
    vault_id,
    secret_hash,
    envelope,
    updated_at,
    expires_at
  )
  values (
    p_vault_id,
    v_secret_hash,
    p_envelope,
    now(),
    now() + interval '18 months'
  )
  on conflict (vault_id) do update
    set envelope = excluded.envelope,
        updated_at = now(),
        expires_at = now() + interval '18 months'
    where vault.secret_hash = v_secret_hash
  returning vault.updated_at into v_updated_at;

  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'invalid secure sync authorization';
  end if;

  return query select v_updated_at;
end;
$$;

create or replace function public.read_war_room_sync(
  p_vault_id text,
  p_secret text
)
returns table(envelope jsonb, updated_at timestamptz)
language sql
security definer
set search_path = public, extensions
as $$
  select vault.envelope, vault.updated_at
  from public.war_room_sync_vaults as vault
  where vault.vault_id = p_vault_id
    and vault.secret_hash = encode(extensions.digest(p_secret, 'sha256'), 'hex')
    and vault.expires_at > now()
  limit 1;
$$;

revoke all on function public.save_war_room_sync(text, text, jsonb) from public;
revoke all on function public.read_war_room_sync(text, text) from public;
grant execute on function public.save_war_room_sync(text, text, jsonb) to anon;
grant execute on function public.read_war_room_sync(text, text) to anon;
