import clsx from 'clsx';

export function Componente({ estado, aberto }: { estado: string; aberto: boolean }) {
  return (
    <div
      className="a dk-conversa-vazia b"
      data-painel={aberto ? 'aberto' : 'fechado'}
      style={{ '--cor-fundo': '#000' }}
    >
      <span className={`dk-conversa-vazia ${estado}`} />
      <span className={`dk-${estado}`} />
      <span className={clsx('dk-conversa-vazia', { 'dk-conversa-vazia-2': aberto })} />
      <p>dk-conversa-vazia</p>
      <button
        data-nao-lida="true"
        onClick={(event) => {
          (event.target as HTMLElement).classList.add('dk-conversa-vazia');
          document.querySelector('.dk-conversa-vazia');
          (event.target as HTMLElement).style.setProperty('--cor-fundo', '#111');
          (event.target as HTMLElement).dataset.naoLida = 'true';
        }}
      />
    </div>
  );
}
