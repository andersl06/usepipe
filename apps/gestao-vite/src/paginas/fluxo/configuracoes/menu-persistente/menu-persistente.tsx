import { useContato } from '../../contato';
import { TelaDeMenuPersistente } from './tela';

/**
 * `/configurations/persistentMenu`. O canal compatível é o Messenger — o
 * mesmo `canalTipo`/`canalAtivo` que `fluxo/canais/canais.tsx` já lê do
 * contato (`GET /v1/gestao/fluxos/:id`), sem inventar um estado à parte.
 */
export function PaginaDeMenuPersistente() {
  const { contato } = useContato();
  const canalCompativel = contato.canalAtivo === true && contato.canalTipo === 'messenger';
  return <TelaDeMenuPersistente canalCompativel={canalCompativel} />;
}
