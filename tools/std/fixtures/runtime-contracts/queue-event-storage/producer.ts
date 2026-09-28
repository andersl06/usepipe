import { Queue } from 'bullmq';

export const producerQueue = new Queue('fila-envio');
