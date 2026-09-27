import { Worker } from 'bullmq';

export const consumerWorker = new Worker('send-queue', async () => {});
