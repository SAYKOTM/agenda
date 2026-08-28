-- Cron diario que refresca el rating de Google de cada tenant (ver refresh-google-ratings).
-- Mismo patrón que notification_dispatch_config() de 0027: URL + secreto en Vault, no hace nada
-- si todavía no están configurados (no rompe nada mientras no haya API key de Google Places).
--   select vault.create_secret('https://<project-ref>.supabase.co/functions/v1/refresh-google-ratings', 'google_rating_refresh_url');
--   select vault.create_secret('un-secreto-largo-random', 'google_rating_refresh_secret');
create or replace function google_rating_refresh_config() returns table (url text, secret text)
language sql stable security definer set search_path = public as $$
  select
    (select decrypted_secret from vault.decrypted_secrets where name = 'google_rating_refresh_url'),
    (select decrypted_secret from vault.decrypted_secrets where name = 'google_rating_refresh_secret');
$$;
revoke all on function google_rating_refresh_config() from public, anon, authenticated;

create or replace function trigger_google_rating_refresh() returns void
language plpgsql security definer set search_path = public as $$
declare
  v_cfg record;
begin
  select * into v_cfg from google_rating_refresh_config();
  if v_cfg.url is null then
    return;
  end if;
  perform net.http_post(
    url := v_cfg.url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'X-Webhook-Secret', coalesce(v_cfg.secret, ''))
  );
end;
$$;

select cron.schedule('refresh-google-ratings', '0 8 * * *', $$select trigger_google_rating_refresh();$$);
