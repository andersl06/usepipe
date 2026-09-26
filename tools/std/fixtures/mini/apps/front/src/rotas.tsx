declare function navigate(path: string): void;
declare const Route: any;
declare const Link: any;
declare const id: string;

navigate('/contatos');
navigate(`/contatos/${id}?aba=historico`);
export const routes = <>
  <Route path="/contatos/:id" />
  <Link to="/contatos" />
  <Link to={`/contatos/${id}`} />
</>;

navigate('/contatos-antigos');
navigate('/contatosx');
navigate('/v1/contatos');
navigate('/busca?destino=/contatos');
export const oldLink = <Link to="/contatosx?destino=/contatos" />;
export const prose = 'contatos são importantes';
export const routeMention = '/contatos';
