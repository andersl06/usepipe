import { Outlet } from 'react-router-dom';
import { CascaDoModulo, useContato } from '../contato';
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
export function CascaDeConfiguracoes() {
  const { contato } = useContato();
  const id = contato.id;
  return (
    <CascaDoModulo ativo="Configurações">
      <div className="cf-casca">
        <NavegacaoConfiguracoes id={id} />
        <section className="cf-miolo">
          <div className="cf-conteudo">
            <Outlet />
          </div>
        </section>
      </div>
    </CascaDoModulo>
  );
}
