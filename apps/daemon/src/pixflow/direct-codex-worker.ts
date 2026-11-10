import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createHash } from 'node:crypto';
import { stopChildProcessTree } from '@open-design/platform';

export type ThreadSnapshot = { instructions: string; context: Record<string, string> };
type Attachment = { id: string; scope: string; settings: string; snapshot?: ThreadSnapshot };
type Worker = { child: ChildProcessWithoutNullStreams; ready: Promise<void>; sequence: number; attached?: Attachment };
type Launch = { executable: string; env: NodeJS.ProcessEnv };
const identity = ({ executable, env }: Launch) => createHash('sha256').update(JSON.stringify([executable, Object.entries(env).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0)])).digest('hex');
const retire = (worker: Worker) => { worker.child.stdin.end(); void stopChildProcessTree(worker.child).catch(() => worker.child.kill()); };

/** One selected standby. A running turn has exclusive ownership until its turn settles. */
export class DirectCodexWorker {
  private selected: Launch | undefined;
  private key = '';
  private generation = 0;
  private idle: Worker | undefined;
  private leased = false;
  constructor(private readonly hostDirectory: string) {}
  select(launch?: Launch) {
    const key = launch ? identity(launch) : '';
    if (key === this.key && (this.idle || this.leased || !launch)) return;
    this.generation++;
    this.key = key;
    this.selected = launch;
    this.leased = false;
    if (this.idle) retire(this.idle);
    this.idle = undefined;
    if (!launch) return;
    const child = spawn(launch.executable, ['app-server', '--stdio', '-c', 'project_root_markers=["AGENTS.md"]'], {cwd:this.hostDirectory, env:launch.env, windowsHide:true, stdio:['pipe','pipe','pipe']});
    const ready = new Promise<void>((resolve, reject) => {
      let buffer = '';
      const finish = (error?: Error) => {
        clearTimeout(timer);
        child.stdout.off('data', receive);
        child.off('error', failed); child.off('close', failed); child.stdin.off('error', failed);
        if (error) reject(error); else resolve();
      };
      const failed = () => finish(new Error('Codex warm startup failed.'));
      const receive = (chunk: Buffer) => {
        buffer += chunk.toString();
        if (buffer.length > 1_000_000) return failed();
        let end: number;
        while ((end = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0,end); buffer = buffer.slice(end+1);
          let reply;
          try { reply = JSON.parse(line); } catch { continue; }
          if (reply.id !== 0) continue;
          if (reply.error || !reply.result) return failed();
          child.stdin.write(JSON.stringify({method:'initialized'})+'\n');
          return finish();
        }
      };
      const timer = setTimeout(failed, 30_000);
      child.stdout.on('data', receive);
      child.on('error', failed); child.once('close', failed); child.stdin.on('error', failed);
      child.stdin.write(JSON.stringify({id:0,method:'initialize',params:{clientInfo:{name:'pixflow_design',title:'Pixflow Design',version:'2.0.3'},capabilities:{experimentalApi:true}}})+'\n');
    });
    const worker = { child, ready, sequence:0 };
    void ready.catch(() => { if (this.idle === worker) { this.idle = undefined; retire(worker); } });
    this.idle = worker;
    const lost = () => { if (this.idle === worker) this.idle = undefined; };
    child.on('error', lost);
    child.once('close', lost);
    child.stdin.on('error', lost);
    child.stderr.resume();
  }
  /** Reconcile the selected executable with the current server-owned launch environment. */
  refreshLaunch(launch: Launch) {
    if (!this.leased) this.select(launch);
  }
  acquire(launch: Launch, resumeId?: string | null, scope?: string) {
    if (!this.selected || identity(launch) !== this.key) return;
    const attached = this.idle?.attached;
    if (attached && (attached.id !== resumeId || attached.scope !== scope)) {
      retire(this.idle!);
      this.idle = undefined;
    }
    if (!this.idle && !this.leased) this.select(this.selected);
    const worker = this.idle;
    if (!worker) return;
    const generation = this.generation;
    this.idle = undefined;
    this.leased = true;
    return { worker, release: (healthy: boolean) => {
      if (generation === this.generation) this.leased = false;
      if (healthy && generation === this.generation && worker.child.exitCode === null && !worker.child.killed && worker.child.stdin.writable) this.idle = worker;
      else { retire(worker); if (generation === this.generation && this.selected) this.select(this.selected); }
    } };
  }
}
