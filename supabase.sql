-- AEGIS · cole no Supabase: SQL Editor → New query → Run
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Operador',
  memory_enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create table public.messages (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null check (char_length(content) <= 8000),
  created_at timestamptz not null default now()
);
create table public.memories (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null check (char_length(title) <= 80),
  content text not null check (char_length(content) <= 500),
  created_at timestamptz not null default now()
);
create index on public.messages (user_id, id);
create index on public.memories (user_id, id);

alter table public.profiles enable row level security;
alter table public.messages enable row level security;
alter table public.memories enable row level security;
create policy "perfil proprio" on public.profiles for all using (auth.uid() = id) with check (auth.uid() = id);
create policy "mensagens proprias" on public.messages for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "memorias proprias" on public.memories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- cria o perfil automaticamente no cadastro, com o nome informado
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), 'Operador'));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
