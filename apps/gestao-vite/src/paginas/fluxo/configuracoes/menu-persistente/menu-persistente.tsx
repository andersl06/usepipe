import type { ConfiguracaoDeMenuPersistente } from '@pipe/contracts';
import { useLeitura } from '../../../../lib/consulta';
import { useContato } from '../../contato';
import { TelaDeMenuPersistente } from './tela';

/**
 * `/configurations/persistentMenu`. O canal compatível é o Messenger — o
 * mesmo `canalTipo`/`canalAtivo` que `fluxo/canais/canais.tsx` já lê do
 * contato (`GET /v1/gestao/fluxos/:id`), sem inventar um estado à parte. Os
 * itens e a trava de "boas-vindas preenchida" vêm de
 * `GET /v1/gestao/fluxos/:id/menu-persistente`.
 */
export function PaginaDeMenuPersistente() {
  const { contato } = useContato();
  const canalCompativel = contato.canalAtivo === true && contato.canalTipo === 'messenger';
  const leitura = useLeitura<ConfiguracaoDeMenuPersistente>(
    `/v1/gestao/fluxos/${contato.id}/menu-persistente`,
  );
  if (!leitura.data) return null;
  return (
    <TelaDeMenuPersistente
      id={contato.id}
      canalCompativel={canalCompativel}
      inicial={leitura.data}
    />
  );
}
