import { gravarContato } from '../gravar';
import { irPara } from '../../../lib/navegacao';
import { RECADOS } from './regras';

/**
 * Criar um fluxo: grava pela `api` e vai para a tela do contato recém-criado —
 * o `goToApplicationDetails()` da origem, que termina em
 * `auth.application.detail.home`. Com erro, volta ao passo do nome com o motivo
 * e o nome digitado na URL, como a tela já sabe mostrar.
 *
 * TODO(template): o campo oculto `template` (só presente quando a pessoa veio
 * de "Usar template", ver `casco.tsx` e `fluxo/page.tsx`) chega até aqui e não
 * é usado. Na origem, `MarketplaceTemplatesService.processTemplate` aplicaria
 * ao fluxo recém-criado o horário de atendimento, o transbordo humano, a
 * avaliação e a verificação de atendentes do `blip_deskCustomerService` — não
 * existe endpoint equivalente em `apps/api` hoje, e este arquivo não deve
 * inventar um contrato novo. Quando ele existir, é aqui que entra a segunda
 * chamada, depois de `resultado.id` sair da `gravarContato`.
 */
export async function criarFluxo(dados: FormData): Promise<void> {
  const resultado = await gravarContato(dados, { tipo: 'fluxo', recados: RECADOS });
  if (resultado.erro) {
    return voltarComErro(resultado.erro, String(dados.get('nome') ?? ''), dados.get('template'));
  }
  irPara(`/fluxo/${resultado.id}`);
}

function voltarComErro(motivo: string, nome: string, template: FormDataEntryValue | null): void {
  const busca = new URLSearchParams({ passo: 'nome', erro: motivo });
  if (nome) busca.set('nome', nome);
  if (typeof template === 'string' && template) busca.set('template', template);
  irPara(`/criar/fluxo?${busca}`);
}
