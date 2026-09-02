import { WorkerEntrypoint } from 'cloudflare:workers';
import { workersHandler } from './services/workers-handler';

export default class extends WorkerEntrypoint<Env> {
  async fetch(request: Request) {
    return workersHandler(request, this.env, this.ctx);
  }
}
