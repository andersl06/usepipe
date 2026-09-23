import { useEffect, useState } from 'react';
import { ModalConfirmacao } from '../../../cadastros/_modal';
import { useLeitura } from '../../../../lib/consulta';
import {
  BotaoBds,
  BotaoDeIcone,
  CabecalhoDaPagina,
  CampoBds,
  CampoCopiavel,
  Papel,
} from '../pecas';
import { LIMITE_DE_CHAVES, erroAoCriar, marcarPadrao, noLimite, podeExcluir } from '../regras';
import { criarChave, revogarChave, type ChaveListada } from './gravar';

/** `/assets/img/ballons.svg` — os dois balões da ajuda, na tinta da marca suave. */
function Baloes() {
  return (
    <svg
      className="cf-baloes"
      width="94"
      height="118"
      viewBox="0 0 94 118"
      aria-hidden="true"
      focusable="false"
    >
      <g transform="translate(0 5)" fill="currentColor" fillRule="evenodd">
        <path
          opacity="0.2"
          d="M60.6561265,0 C53.8123496,0 46.7195949,1.10628571 41.8863137,4.114 C34.0466257,8.98857143 31.7529178,18.5082857 32.0205689,27.2737143 C32.2508734,34.8542857 34.2644812,42.9942857 39.6143914,48.5948571 C44.718436,53.9345714 55.2128496,56.3357143 62.3678488,56.3357143 C62.6915199,56.3357143 63.0338643,56.5714286 63.0338643,57.0082857 L63.0338643,64.658 C63.0338643,65.4122857 63.6158499,66 64.3627833,66 C64.4063544,66 64.4468133,65.9905714 64.4872721,65.9874286 C64.7704844,65.9622857 65.0194622,65.8554286 65.2186444,65.6888571 C68.8257101,62.5774286 72.4296635,59.4094286 75.909128,56.1534286 C79.2454304,53.0294286 83.0236683,49.8205714 85.6317106,46.0805714 C91.1341196,38.192 91.9495219,27.038 90.1257596,17.7917143 C88.3704662,8.89428571 82.1117871,3.102 73.3384324,1.25714286 C69.7282545,0.499714286 65.2497666,0 60.6561265,0 M60.6561265,3.20257143 C64.7673722,3.20257143 69.0404534,3.62371429 72.6942024,4.39057143 C80.4685337,6.02485714 85.553905,11.0062857 87.0166495,18.4171429 C87.9098573,22.946 88.0716929,27.6477143 87.4865951,32.0131429 C86.8392528,36.8248571 85.3422739,40.9357143 83.0392294,44.2357143 C81.0660804,47.0674286 78.2215092,49.6854286 75.4703047,52.2185714 C74.8914314,52.7497143 74.3156702,53.2808571 73.752358,53.8057143 C71.1972235,56.2005714 68.6109667,58.5074286 66.2021066,60.6131429 L66.2021066,57.0082857 C66.2021066,54.8711429 64.4841599,53.1362857 62.3678488,53.1362857 C55.5769797,53.1362857 46.0940383,50.7634286 41.8956504,46.3728571 C36.6702291,40.9011429 35.3630957,32.912 35.1888113,27.1762857 C35.0207513,21.626 35.8828368,11.6065714 43.5513526,6.83885714 C47.3202539,4.49428571 53.3953118,3.20257143 60.6561265,3.20257143"
        />
        <path
          opacity="0.33"
          d="M20.8849735,61 C15.8971362,61 10.7278404,61.8045714 7.20527947,63.992 C1.49160854,67.5371429 -0.18007684,74.4605714 0.0149909249,80.8354286 C0.182839932,86.3485714 1.65038463,92.2685714 5.5494717,96.3417143 C9.26936861,100.225143 16.9178396,101.971429 22.1324999,101.971429 C22.3683958,101.971429 22.6179011,102.142857 22.6179011,102.460571 L22.6179011,108.024 C22.6179011,108.572571 23.0420601,109 23.5864353,109 C23.6181905,109 23.6476775,108.993143 23.6771644,108.990857 C23.8835734,108.972571 24.0650317,108.894857 24.2101985,108.773714 C26.8390768,106.510857 29.465687,104.206857 32.0015679,101.838857 C34.4331103,99.5668571 37.1867413,97.2331429 39.0875179,94.5131429 C43.0977482,88.776 43.6920244,80.664 42.3628417,73.9394286 C41.0835601,67.4685714 36.5221499,63.256 30.1280101,61.9142857 C27.4968635,61.3634286 24.2328808,61 20.8849735,61 M20.8849735,63.3291429 C23.8813051,63.3291429 26.9955847,63.6354286 29.6584865,64.1931429 C35.3245246,65.3817143 39.0308121,69.0045714 40.0968801,74.3942857 C40.7478621,77.688 40.8658101,81.1074286 40.4393828,84.2822857 C39.967591,87.7817143 38.8765725,90.7714286 37.1980824,93.1714286 C35.7600247,95.2308571 33.6868627,97.1348571 31.6817475,98.9771429 C31.2598567,99.3634286 30.8402342,99.7497143 30.4296846,100.131429 C28.5674679,101.873143 26.682569,103.550857 24.9269591,105.082286 L24.9269591,102.460571 C24.9269591,100.906286 23.6748962,99.6445714 22.1324999,99.6445714 C17.1832225,99.6445714 10.2719262,97.9188571 7.21208416,94.7257143 C3.40372628,90.7462857 2.45106976,84.936 2.32404889,80.7645714 C2.20156448,76.728 2.82986414,69.4411429 8.41878242,65.9737143 C11.1656087,64.2685714 15.5931934,63.3291429 20.8849735,63.3291429"
        />
      </g>
    </svg>
  );
}

/** A data em pt-BR, para o "Data de criação" da origem. */
function formatarData(iso: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  })
    .format(new Date(iso))
    .replace(',', ' -');
}

function ModalDaChave({ token, onFechar }: { token: string; onFechar: () => void }) {
  useEffect(() => {
    const fecharComEscape = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') onFechar();
    };
    document.addEventListener('keydown', fecharComEscape);
    return () => document.removeEventListener('keydown', fecharComEscape);
  }, [onFechar]);

  return (
    <div className="cf-sobreposicao">
      <div
        className="cf-modal cf-modal--chave"
        role="dialog"
        aria-modal="true"
        aria-labelledby="titulo-chave-gerada"
      >
        <h2 id="titulo-chave-gerada">Chave de acesso</h2>
        <div className="cf-modal-aviso" role="alert">
          <ul>
            <li>Copie sua chave. Por segurança, ela não será exibida novamente.</li>
            <li>Se você usa uma sessão HTTP, atualize o cabeçalho com a nova chave.</li>
          </ul>
        </div>
        <div className="cf-modal-chave-campo">
          <h3>Usando SDK</h3>
          <p>Chave de acesso</p>
          <CampoCopiavel rotulo="Chave de acesso" valor={token} />
        </div>
        <div className="cf-modal-chave-campo">
          <h3>Usando HTTP</h3>
          <p>Cabeçalho de autenticação</p>
          <CampoCopiavel rotulo="Autorização HTTP" valor={`Bearer ${token}`} />
        </div>
        <div className="cf-modal-acoes">
          <BotaoBds autoFocus onClick={onFechar}>
            Fechar
          </BotaoBds>
        </div>
      </div>
    </div>
  );
}

/**
 * O miolo de `/configurations/keys` (template do módulo 76179), agora real:
 * `GET/POST /v1/gestao/fluxos/:id/chaves` e `DELETE .../chaves/:chaveId`
 * (que revoga — `dominio/gestao/integracoes.ts`). O token em claro
 * (`pipe_<prefixo>_<segredo>`) só existe na resposta do `POST`; a lista
 * seguinte já vem só com o prefixo.
 */
export function TelaDeChaves({ fluxoId }: { fluxoId: string }) {
  const caminho = `/v1/gestao/fluxos/${fluxoId}/chaves`;
  const { data, isLoading } = useLeitura<ChaveListada[]>(caminho);
  const chaves = marcarPadrao(data ?? []);

  const [mostrarAjuda, setMostrarAjuda] = useState(false);
  const [criando, setCriando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [nome, setNome] = useState('');
  const [aviso, setAviso] = useState('');
  const [tokenGerado, setTokenGerado] = useState<string | null>(null);
  const [excluindo, setExcluindo] = useState<(ChaveListada & { padrao: boolean }) | null>(null);
  const [erroDeExclusao, setErroDeExclusao] = useState<string | null>(null);
  const [excluindoAgora, setExcluindoAgora] = useState(false);

  const limite = noLimite(chaves.length);

  async function criar() {
    const erro = erroAoCriar(nome, chaves.length);
    if (erro === 'limite') {
      setAviso(`Limite de ${LIMITE_DE_CHAVES} chaves atingido`);
      return;
    }
    if (erro === 'nome') {
      setAviso('Adicione um nome para identificar a chave');
      return;
    }
    setSalvando(true);
    setAviso('');
    const resultado = await criarChave(fluxoId, nome.trim());
    setSalvando(false);
    if (!resultado.ok) {
      setAviso(resultado.erro);
      return;
    }
    setCriando(false);
    setNome('');
    setTokenGerado(resultado.valor.token);
  }

  async function confirmarExclusao() {
    if (!excluindo) return;
    setExcluindoAgora(true);
    setErroDeExclusao(null);
    const resultado = await revogarChave(fluxoId, excluindo.id);
    setExcluindoAgora(false);
    if (!resultado.ok) {
      setErroDeExclusao(resultado.erro);
      return;
    }
    setExcluindo(null);
  }

  return (
    <>
      <CabecalhoDaPagina
        id="accesskey-header"
        titulo={
          <div className="cf-chaves-titulo">
            <h1>Chaves de acesso</h1>
            <BotaoDeIcone
              icone="informacao"
              rotulo="Mais informações"
              aria-expanded={mostrarAjuda}
              onClick={() => setMostrarAjuda((valor) => !valor)}
            />
          </div>
        }
        acoes={
          limite ? (
            <p className="cf-faixa-alerta" role="status">
              Limite de {LIMITE_DE_CHAVES} chaves atingido
            </p>
          ) : (
            <BotaoBds
              icone="mais"
              disabled={criando || isLoading}
              onClick={() => {
                setCriando(true);
                setAviso('');
              }}
            >
              Nova chave
            </BotaoBds>
          )
        }
      />

      <div className="cf-container cf-chaves">
        {mostrarAjuda ? (
          <Papel className="cf-chaves-ajuda">
            <div className="cf-chaves-ajuda-dados">
              <div className="cf-chaves-ajuda-texto">
                <p>
                  <strong>Chaves de acesso</strong>: as chaves de acesso são usadas para fazer a
                  autenticação do chatbot em conexões externas. É possível usá-las em conexões
                  usando SDK ou usando HTTP.
                </p>
                <p>
                  <strong>Limite de chaves</strong>: é possível manter até {LIMITE_DE_CHAVES} chaves
                  simultâneas.
                </p>
                <p>
                  <strong>Exclusão de chaves</strong>: não é possível excluir a chave padrão.
                </p>
              </div>
              <BotaoBds variante="tertiary" onClick={() => setMostrarAjuda(false)}>
                Ok
              </BotaoBds>
            </div>
            <Baloes />
          </Papel>
        ) : null}

        {criando ? (
          <Papel className="cf-chaves-criar">
            <div className="cf-chaves-criar-dados">
              <CampoBds
                id="name"
                rotulo="Nome"
                placeholder="Dê um nome para a chave"
                valor={nome}
                aoMudar={setNome}
                maxLength={100}
                desabilitado={salvando}
              />
              {aviso ? (
                <p className="cf-aviso" role="alert">
                  {aviso}
                </p>
              ) : null}
            </div>
            <div className="cf-chaves-criar-acoes">
              <BotaoBds
                variante="secondary"
                disabled={salvando}
                onClick={() => {
                  setCriando(false);
                  setNome('');
                  setAviso('');
                }}
              >
                Cancelar
              </BotaoBds>
              <BotaoBds onClick={() => void criar()} disabled={salvando}>
                Criar
              </BotaoBds>
            </div>
          </Papel>
        ) : null}

        {chaves.map((chave) => (
          <Papel key={chave.id}>
            <div className="cf-chave">
              <dl className="cf-chave-dados">
                <div className="cf-chave-coluna">
                  <dt>Id</dt>
                  <dd>{chave.id}</dd>
                </div>
                <div className="cf-chave-coluna">
                  <dt>Data de criação</dt>
                  <dd>{formatarData(chave.criadaEm)}</dd>
                </div>
                <div className="cf-chave-coluna">
                  <dt>Nome</dt>
                  <dd>{chave.nome}</dd>
                </div>
                <div className="cf-chave-coluna">
                  <dt>Requisitante</dt>
                  <dd>{chave.requisitante ?? '-'}</dd>
                </div>
              </dl>
              <div className="cf-chave-selo">
                {chave.padrao ? <span className="cf-selo cf-selo--info">Padrão</span> : null}
              </div>
              <div className="cf-chave-acoes">
                <BotaoDeIcone
                  icone="lixeira"
                  rotulo="Excluir chave"
                  disabled={!podeExcluir(chave)}
                  onClick={() => {
                    setErroDeExclusao(null);
                    setExcluindo(chave);
                  }}
                />
              </div>
            </div>
          </Papel>
        ))}
      </div>

      {tokenGerado ? (
        <ModalDaChave token={tokenGerado} onFechar={() => setTokenGerado(null)} />
      ) : null}

      <ModalConfirmacao
        aberto={excluindo !== null}
        titulo="Excluir chave"
        mensagem={
          <>
            <strong>Cuidado</strong>: certifique-se de que a chave removida não seja a mesma usada
            para a configuração HTTP do bot.
            <br />
            Quer mesmo excluir a chave &quot;{excluindo?.nome}&quot;?
          </>
        }
        erro={erroDeExclusao}
        confirmando={excluindoAgora}
        onConfirmar={() => void confirmarExclusao()}
        onCancelar={() => setExcluindo(null)}
      />
    </>
  );
}
