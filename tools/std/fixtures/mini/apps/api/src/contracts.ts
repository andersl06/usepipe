declare function Controller(path: string): ClassDecorator;
declare function Get(path: string): MethodDecorator;
declare const app: any;
declare const id: string;
declare const queryClient: any;
declare const Queue: any;
declare const Worker: any;
declare function describe(title: string, fn: () => void): void;
declare const body: any;
declare const x: any;
declare function toast(message: string): void;

@Controller('v1/conversas')
class ConversationsController {
  @Get(':id/mensagens') list() {}
}

app.use('/v1/conversas/:id/mensagens', () => {});
export const endpoint = `/v1/conversas/${id}/mensagens?x=1`;
queryClient.invalidateQueries({ queryKey: ['api', '/v1/conversas'] });
export const textoVisivel = 'conversas e mensagens';

const FILA_ENTRADA = 'pipe-entrada';
new Queue(FILA_ENTRADA);
new Worker('pipe-entrada');
describe('faz uma coisa', () => {});

export const contato = body.contatoId;
export const payload: any = { contatoId: 1 };
export const elemento = x['contatoId'];

export type Painel = 'aberto' | 'fechado';
export const painel: Painel = 'aberto';
export function usarPainel(p: Painel) {
  if (p === 'aberto') return true;
  switch (p) {
    case 'aberto':
      return false;
  }
}
export function setPainel(_painel: Painel) {}
setPainel('aberto');
toast('aberto');
