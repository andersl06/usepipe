'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Visões salvas da listagem.
 *
 * O que o Twenty guarda numa tabela de `view`, nós guardamos na URL. Aba, busca,
 * agrupamento, coluna de ordenação e sentido já vivem inteiros na barra de
 * endereço, então uma visão salva é só um nome dado a uma consulta que já
 * existe. Isso tem três consequências boas e uma limitação honesta:
 *
 * - a visão é compartilhável colando o endereço, sem salvar nada;
 * - voltar e avançar no navegador funcionam entre visões;
 * - não existe estado escondido que a URL não mostre.
 *
 * A limitação: a lista de visões vive no `localStorage` deste navegador, então
 * não acompanha a pessoa entre máquinas nem é compartilhada com o time. Guardar
 * no banco exigiria uma tabela `visao`, que ainda não existe. Quando existir, só
 * este arquivo muda: a forma da visão (um nome e uma consulta) já é a definitiva.
 */

const CHAVE = 'pipe.crm.leads.visoes';

interface Visao {
  nome: string;
  consulta: string;
}

function ler(): Visao[] {
  try {
    const cru = localStorage.getItem(CHAVE);
    if (!cru) return [];
    const lido: unknown = JSON.parse(cru);
    if (!Array.isArray(lido)) return [];
    return lido.filter(
      (v): v is Visao =>
        typeof v === 'object' &&
        v !== null &&
        typeof (v as Visao).nome === 'string' &&
        typeof (v as Visao).consulta === 'string',
    );
  } catch {
    // Navegador com armazenamento bloqueado, ou conteúdo corrompido por uma
    // versão anterior. Nenhuma visão é melhor do que uma tela que não abre.
    return [];
  }
}

function gravar(visoes: Visao[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(visoes));
  } catch {
    // Sem armazenamento a visão vale só para esta sessão, e a tela segue.
  }
}

export function VisoesSalvas({ consultaAtual }: { consultaAtual: string }) {
  const router = useRouter();
  const [visoes, setVisoes] = useState<Visao[]>([]);
  // O `localStorage` só existe depois de montar. Ler durante a renderização
  // faria o servidor e o navegador desenharem coisas diferentes.
  useEffect(() => setVisoes(ler()), []);

  const atual = visoes.find((v) => v.consulta === consultaAtual);

  function salvar() {
    const nome = window.prompt('Nome desta visão')?.trim();
    if (!nome) return;
    const proximas = [...visoes.filter((v) => v.nome !== nome), { nome, consulta: consultaAtual }];
    proximas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
    setVisoes(proximas);
    gravar(proximas);
  }

  function apagar() {
    if (!atual) return;
    const proximas = visoes.filter((v) => v.nome !== atual.nome);
    setVisoes(proximas);
    gravar(proximas);
  }

  return (
    <div className="visoes">
      {visoes.length > 0 ? (
        <label>
          Visão
          <select
            className="seletor"
            value={atual?.nome ?? ''}
            aria-label="Visão salva"
            onChange={(e) => {
              const escolhida = visoes.find((v) => v.nome === e.target.value);
              if (escolhida) router.push(`/leads?${escolhida.consulta}`);
            }}
          >
            {/* Sem visão escolhida é um estado real da tela, não um item morto:
                é o que aparece quando a pessoa mexeu nos filtros depois de abrir
                uma visão salva. */}
            <option value="">{atual ? 'Escolha' : 'Nenhuma'}</option>
            {visoes.map((v) => (
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
