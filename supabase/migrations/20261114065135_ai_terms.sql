-- Words the assistant has learned for money heads (খাত): when the user moves a card to another
-- head ("খাত বদলান"), or teaches it ("এখন থেকে পানি মানে আনুষাঙ্গিক"), the phrase and its head
-- are kept here and given to the model with every message, so the same words land in the right
-- head next time. One row per phrase (phrase_key = the phrase lower-cased, NFC, single spaces,
-- written by the app). Any role reads and writes (the assistant is used by managers too); only an
-- admin deletes, from সেটিংস → সহকারীর শেখা শব্দ.

create table if not exists public.ai_terms (
  id uuid primary key default gen_random_uuid(),
  phrase text not null check (char_length(btrim(phrase)) between 1 and 80),
  phrase_key text not null check (char_length(phrase_key) between 1 and 80),
  head text not null check (head in (
    'sale', 'openingIn', 'ownerInvest', 'loanIn', 'loanBack',
    'sardar', 'daily', 'staff', 'ownerSalary', 'raw',
    'parts', 'veku', 'vehicle', 'land', 'power', 'clean', 'misc',
    'asset', 'ownerWithdraw', 'loanGive', 'loanRepay', 'openingOut'
  )),
  person text,
  item text,
  source text not null default 'fix' check (source in ('fix', 'teach')),
  uses integer not null default 1,
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ai_terms_phrase_key_key unique (phrase_key)
);

comment on table public.ai_terms is 'phrases the assistant learned for money heads (from a head change on a card or "এখন থেকে X মানে Y")';

alter table public.ai_terms enable row level security;

revoke all on public.ai_terms from anon;
grant select, insert, update, delete on public.ai_terms to authenticated;

drop policy if exists "role read ai_terms" on public.ai_terms;
create policy "role read ai_terms" on public.ai_terms
  for select to authenticated using (private.has_any_role(auth.uid()));

drop policy if exists "role insert ai_terms" on public.ai_terms;
create policy "role insert ai_terms" on public.ai_terms
  for insert to authenticated with check (private.has_any_role(auth.uid()) and created_by = auth.uid());

drop policy if exists "role update ai_terms" on public.ai_terms;
create policy "role update ai_terms" on public.ai_terms
  for update to authenticated using (private.has_any_role(auth.uid())) with check (private.has_any_role(auth.uid()));

drop policy if exists "admin delete ai_terms" on public.ai_terms;
create policy "admin delete ai_terms" on public.ai_terms
  for delete to authenticated using (private.is_admin(auth.uid()));

drop trigger if exists trg_ai_terms_updated on public.ai_terms;
create trigger trg_ai_terms_updated
  before update on public.ai_terms
  for each row execute function public.update_updated_at_column();
