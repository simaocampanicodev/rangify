/**
 * O que os testes de SQL partilham: um Postgres local (PGlite) com os papéis e o esquema "auth" do Supabase, as
 * migrações aplicadas pela ordem dos nomes, e os ajudantes para correr SQL como cada papel.
 *
 *   import { criarBase } from './_arnes.mjs'
 *   const t = await criarBase()
 *   t.ok(cond, 'texto'); await t.falha(promessa, 'parte do erro', 'texto'); t.resumo()
 */
import { readdirSync, readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

/** O que o Supabase já traz (papéis, auth.users, auth.uid, privilégios por omissão, Storage mínimo, Realtime). */
export const SUPABASE_BASE = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text, raw_user_meta_data jsonb not null default '{}');
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated, service_role;
  grant execute on function auth.uid() to anon, authenticated, service_role;
  grant usage on schema public to anon, authenticated, service_role;
  alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
  alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
  alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$
    select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
  $$;
  grant usage on schema storage to anon, authenticated, service_role;
  grant all on storage.objects to authenticated;
  create publication supabase_realtime;
`

export const ficheirosDeMigracao = () =>
  readdirSync(new URL('../../supabase/migrations/', import.meta.url)).filter((f) => f.endsWith('.sql')).sort()
export const migracao = (f) => readFileSync(new URL(`../../supabase/migrations/${f}`, import.meta.url), 'utf8')

export async function criarBase({ migracoes = true } = {}) {
  const db = new PGlite()
  let falhas = 0
  let passos = 0

  const ok = (cond, texto) => {
    passos++
    if (cond) console.log(`  ok  ${texto}`)
    else { falhas++; console.log(`  FALHOU  ${texto}`) }
  }
  const falha = async (promessa, contem, texto) => {
    try {
      await promessa
      ok(false, `${texto} (devia dar erro)`)
    } catch (e) {
      ok(String(e.message).includes(contem), `${texto}: "${e.message}"`)
    }
  }
  const noPapel = (papel, extra = '') => async (sql, params = []) =>
    db.transaction(async (tx) => {
      await tx.exec(`set local role ${papel}; ${extra}`)
      return (await tx.query(sql, params)).rows
    })
  /** Como um utilizador autenticado (RLS e permissões a sério). */
  const como = (uid, sql, params = []) => noPapel('authenticated', `select set_config('request.jwt.claim.sub', '${uid}', true);`)(sql, params)
  const servico = noPapel('service_role')
  const anon = noPapel('anon')
  const raiz = async (sql, params = []) => (await db.query(sql, params)).rows
  const rpc = async (uid, nome, args = {}) => {
    const chaves = Object.keys(args)
    const sql = `select public.${nome}(${chaves.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`
    return (await como(uid, sql, Object.values(args)))[0]?.r
  }
  const resumo = () => {
    console.log(`\n${passos - falhas}/${passos} verificações passaram.`)
    process.exit(falhas ? 1 : 0)
  }

  await db.exec(SUPABASE_BASE)
  if (migracoes) for (const f of ficheirosDeMigracao()) await db.exec(migracao(f))

  /** Cria n contas com perfil (a ordem de criação é a ordem dos ids). */
  const criarContas = async (n, prefixo = 'u') => {
    const uids = []
    for (let i = 0; i < n; i++) {
      const [{ id }] = await raiz(`insert into auth.users (email, raw_user_meta_data) values ($1, $2) returning id`, [`${prefixo}${i}@teste.pt`, { name: `${prefixo}${i}#0`, avatar_url: null }])
      uids.push(id)
    }
    return uids
  }

  return { db, ok, falha, como, servico, anon, raiz, rpc, resumo, criarContas }
}
