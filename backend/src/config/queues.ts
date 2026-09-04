import { Queue } from 'bullmq';
import { redis } from './redis';

const connection = redis;

export const webhookIngestionQueue = new Queue('webhook-ingestion', { connection });
export const diagnosisQueue = new Queue('diagnosis', { connection });
export const voiceQueue = new Queue('intervention-voice', { connection });
export const whatsappQueue = new Queue('intervention-whatsapp', { connection });
export const emailQueue = new Queue('intervention-email', { connection });
export const retrySchedulerQueue = new Queue('retry-scheduler', { connection });
export const promiseTrackerQueue = new Queue('promise-tracker', { connection });
