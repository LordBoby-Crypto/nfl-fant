drop policy if exists "Read authorized sync vault"
on public.war_room_sync_vaults;
drop policy if exists "Create authorized sync vault"
on public.war_room_sync_vaults;
drop policy if exists "Update authorized sync vault"
on public.war_room_sync_vaults;

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
        )::jsonb ->> 'x-vault-secret',
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
        )::jsonb ->> 'x-vault-secret',
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
        )::jsonb ->> 'x-vault-secret',
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
        )::jsonb ->> 'x-vault-secret',
        ''
      ),
      'sha256'
    ),
    'hex'
  )
);
