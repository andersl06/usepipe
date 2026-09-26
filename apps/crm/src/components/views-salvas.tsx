'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Saved views for the listing.
 *
 * What Twenty stores in a `view` table, we store in the URL. Tab, search,
 * grouping, sort column and direction already live entirely in the address bar,
 * so a saved view is just a name given to a query that already exists. That has
 * three good consequences and one honest limitation:
 *
 * - the view is shareable by pasting the address, without saving anything;
 * - the browser's back and forward work between views;
 * - there's no hidden state that the URL doesn't show.
 *
 * The limitation: the list of views lives in this browser's `localStorage`, so
 * it doesn't follow the person between machines or get shared with the team.
 * Storing it in the database would need a `visao` table, which doesn't exist
 * yet. When it does, only this file changes: the view's shape (a name and a
 * query) is already the final one.
 */

const KEY = 'pipe.crm.leads.visoes';

interface Visao {
  nome: string;
  query: string;
}

function ler(): Visao[] {
  try {
    const cru = localStorage.getItem(KEY);
    if (!cru) return [];
    const lido: unknown = JSON.parse(cru);
    if (!Array.isArray(lido)) return [];
    return lido.filter(
      (v): v is Visao =>
        typeof v === 'object' &&
        v !== null &&
        typeof (v as Visao).nome === 'string' &&
        typeof (v as Visao).query === 'string',
    );
  } catch {
    // Browser with storage blocked, or content corrupted by a
    // previous version. No saved view is better than a screen that doesn't open.
    return [];
  }
}

function gravar(views: Visao[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(views));
  } catch {
    // Without storage the view only lasts this session, and the screen still works.
  }
}

export function ViewsSalvas({ queryCurrent }: { queryCurrent: string }) {
  const router = useRouter();
  const [views, setViews] = useState<Visao[]>([]);
  // `localStorage` only exists after mounting. Reading during render
  // faria o servidor e o navegador desenharem coisas diferentes.
  useEffect(() => setViews(ler()), []);

  const atual = views.find((v) => v.query === queryCurrent);

  function salvar() {
    const nome = window.prompt('Nome desta visão')?.trim();
    if (!nome) return;
    const proximas = [...views.filter((v) => v.nome !== nome), { nome, query: queryCurrent }];
    proximas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    setViews(proximas);
    gravar(proximas);
  }

  function apagar() {
    if (!atual) return;
    const proximas = views.filter((v) => v.nome !== atual.nome);
    setViews(proximas);
    gravar(proximas);
  }

  return (
    <div className="views">
      {views.length > 0 ? (
        <label>
          Visão
          <select
            className="seletor"
            value={atual?.nome ?? ''}
            aria-label="Visão salva"
            onChange={(e) => {
              const escolhida = views.find((v) => v.nome === e.target.value);
              if (escolhida) router.push(`/leads?${escolhida.query}`);
            }}
          >
            {/*
 * No view chosen is a real screen state, not a dead item: it's what shows up
 * when the person tweaked the filters after opening a saved view.
 */}
            <option value="">{atual ? 'Escolha' : 'Nenhuma'}</option>
            {views.map((v) => (
              <option key={v.nome} value={v.nome}>
                {v.nome}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {atual ? (
        <button type="button" className="btn" onClick={apagar}>
          Apagar visão
        </button>
      ) : (
        <button type="button" className="btn" onClick={salvar}>
          Salvar visão
        </button>
      )}
    </div>
  );
}
