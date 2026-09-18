import type { ReactNode } from 'react';
import { CascaDoModulo } from '../casca-do-modulo';
import { NavegacaoConfiguracoes } from './navegacao';
import './configuracoes.css';

/**
 * A casca de `auth.application.detail.configurations` (portal.js, mód. 57475):
 *
 *   <aside class="detail-aside fl">  ← a lateral, preenchida pelo template de
 *                                      Configurações (bds-nav-tree-group)
 *   <section id="main-content-area" class="main-detail-content …">
 *     <div class="blip-ui-content …"> <page-header/> <div class="container"/>
 *
 * Os dois ficam LADO A LADO na largura inteira abaixo da barra do contato
 * (`#main-section.pa0` é `display:flex`). A `CascaDoModulo` (compartilhada) já
 * centra o miolo em `fx-coluna` (80%); `.cf-casca` desfaz esse recuo para
 * abrir a lateral na borda, sem tocar o casco.
 */
export default async function LayoutConfiguracoes({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <CascaDoModulo id={id} ativo="Configurações">
      <div className="cf-casca">
        <NavegacaoConfiguracoes id={id} />
        <section className="cf-miolo">
          <div className="cf-conteudo">{children}</div>
        </section>
      </div>
    </CascaDoModulo>
  );
}
