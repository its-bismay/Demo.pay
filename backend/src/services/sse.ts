import { EventEmitter } from 'events';
import { Response } from 'express';

class SseEmitter extends EventEmitter {
  private clients: Set<Response> = new Set();

  addClient(res: Response): void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    this.clients.add(res);
    res.on('close', () => this.clients.delete(res));
  }

  emit(event: string, data: unknown): boolean {
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    this.clients.forEach((client) => client.write(payload));
    return true;
  }
}

export const sseEmitter = new SseEmitter();
