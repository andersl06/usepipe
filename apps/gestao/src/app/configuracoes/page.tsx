import { redirect } from 'next/navigation';

/** A engrenagem cai na primeira seção; uma capa de configurações não diria nada. */
export default function PaginaConfiguracoes() {
  redirect('/configuracoes/regras');
}
