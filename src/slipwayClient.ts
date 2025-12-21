import * as net from 'net';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import * as child from 'child_process';
import * as utils from './utils';
import * as webpier from './webpierContext';

export const enum Command {
    Naught = 0,
    Unplug = 1,
    Engage = 2,
    Adjust = 3,
    Status = 4,
    Review = 5
}

export const enum Status {
    Asleep,
    Broken,
    Lonely,
    Burden
}

export class Handle {
    constructor(public readonly pier: string, public readonly service: string) {}

    static parseOne(data: any): Handle {
        return new Handle(data.pier, data.service);
    }

    static parseArray(data: any[]): Handle[] {
        return data.map(Handle.parseOne);
    }
}

export class Health {
    constructor(
        public readonly pier: string,
        public readonly service: string,
        public readonly state: Status,
        public readonly message: string
    ) {}

    static parseOne(data: any): Health {
        return new Health(data.pier, data.service, data.state, data.message);
    }

    static parseArray(data: any[]): Health[] {
        return data.map(Health.parseOne);
    }
}

export class Tunnel {
    constructor(public readonly pier: string, public readonly pid: number) {}

    static parseOne(data: any): Tunnel {
        return new Tunnel(data.pier, parseInt(data.pid));
    }

    static parseArray(data: any[]): Tunnel[] {
        return data.map(Tunnel.parseOne);
    }
}

export class Report {
    constructor(
        public readonly pier: string,
        public readonly service: string,
        public readonly state: Status,
        public readonly message: string,
        public readonly tunnels: Tunnel[]
    ) {}

    static parseOne(data: any): Report {
        return new Report(
            data.pier,
            data.service,
            parseInt(data.state) as Status,
            data.message,
            Array.isArray(data.tunnels) ? Tunnel.parseArray(data.tunnels) : []
        );
    }

    static parseArray(data: any[]): Report[] {
        return data.map(Report.parseOne);
    }
}

class Message {
    constructor(
        public readonly action: Command,
        public readonly payload?: any
    ) {}

    get ok(): boolean {
        return this.action !== Command.Naught && (typeof this.payload !== 'string' || this.payload.toString() === '');
    }

    static pack(msg: Message): string {
        const data: any = { action: msg.action };
        if (msg.payload !== undefined) {
            if (msg.payload instanceof Handle) {
                data.handle = msg.payload;
            }
        }
        return JSON.stringify(data) + '\n';
    }

    static parse(str: string): Message {
        let info: any;
        try {
            info = JSON.parse(str);
        } catch (err) {
            return new Message(Command.Naught, 'Invalid JSON received');
        }

        const action = parseInt(info.action) as Command;
        if (!action) {
            return new Message(Command.Naught, 'Invalid command');
        }

        if (info.error) {
            return new Message(action, info.error);
        } else if (info.health && action === Command.Status) {
            const payload = Array.isArray(info.health)
                ? Health.parseArray(info.health)
                : Health.parseOne(info.health);
            return new Message(action, payload);
        } else if (info.report && action === Command.Review) {
            const payload = Array.isArray(info.report)
                ? Report.parseArray(info.report)
                : Report.parseOne(info.report);
            return new Message(action, payload);
        }

        return new Message(action);
    }
}

export class Slipway {
    private readonly socketPath: string;
    private client: net.Socket | null = null;

    constructor(private readonly home: string) {
        const hash = utils.makeTextHash(home);
        if (os.platform() === 'win32') {
            this.socketPath = `\\\\.\\pipe\\${hash}.slipway`;
        } else {
            const tmpDir = fs.existsSync('/tmp') ? '/tmp' : os.tmpdir();
            this.socketPath = path.join(tmpDir, `${hash}.slipway`);
        }
    }

    private async getClient(): Promise<net.Socket> {
        if (this.client && !this.client.destroyed) {
            return this.client;
        }

        return new Promise((resolve, reject) => {
            const client = net.createConnection({ path: this.socketPath }, () => {
                this.client = client;
                resolve(client);
            });

            client.once('error', (err) => {
                client.destroy();
                console.error('Socket connection failed:', err.message);
                reject(err);
            });
        });
    }

    private async request(message: Message): Promise<Message> {
        const client = await this.getClient();

        return new Promise((resolve, reject) => {
            const cleanup = () => {
                client.removeListener('data', onData);
                client.removeListener('error', onError);
                client.removeListener('close', onClose);
            };

            const onData = (data: Buffer) => {
                cleanup();
                try {
                    resolve(Message.parse(data.toString()));
                } catch (err) {
                    reject(new Error(`Parse error: ${(err as Error).message}`));
                }
            };

            const onError = (err: Error) => {
                cleanup();
                reject(err);
            };

            const onClose = () => {
                if (this.client === client) {
                    this.client = null;
                }
            };

            client.on('data', onData);
            client.on('error', onError);
            client.on('close', onClose);

            client.write(Message.pack(message), (err) => {
                if (err) {
                    cleanup();
                    reject(err);
                }
            });
        });
    }

    private async performRequest<T>(action: Command, payload?: any): Promise<T> {
        const response = await this.request(new Message(action, payload));
        if (!response.ok) {
            throw new Error(response.payload?.toString() || 'Unknown error');
        }
        if (response.action !== action) {
            throw new Error(`Unexpected response ${response.action}`);
        }
        return response.payload as T;
    }

    private spawnProcess(exec: string, args: string[], hide: boolean): void {
        const proc = child.spawn(exec, args, {
            detached: true,
            stdio: 'ignore',
            windowsHide: hide
        });

        console.log(`Spawned '${exec} ${args.join(' ')}' with pid: ${proc.pid}`);
        proc.unref();
    }

    public launchBackend(): void {
        const exec = webpier.getModulePath('slipway');
        this.spawnProcess(exec, [this.home], true);
    }

    public launchTray(): void {
        let exec = webpier.getModulePath('webpier');
        let args = ['-t', this.home];

        if (os.platform() === 'darwin') {
            let app = exec;
            while (path.basename(app) !== 'WebPier.app') {
                app = path.dirname(app);
            }
            exec = 'open';
            args = ['-n', '-a', app, '--args', ...args];
        }

        this.spawnProcess(exec, args, false);
    }

    public async unplugAll(): Promise<void> {
        await this.performRequest<void>(Command.Unplug);
    }

    public async engageAll(): Promise<void> {
        await this.performRequest<void>(Command.Engage);
    }

    public async adjustAll(): Promise<void> {
        await this.performRequest<void>(Command.Adjust);
    }

    public async statusAll(): Promise<Health[]> {
        const res = await this.performRequest<Health[]>(Command.Status);
        return res ? res : [];
    }

    public async reviewAll(): Promise<Report[]> {
        const res = await this.performRequest<Report[]>(Command.Review);
        return res ? res : [];
    }

    public async unplugService(service: Handle): Promise<void> {
        await this.performRequest<void>(Command.Unplug, service);
    }

    public async engageService(service: Handle): Promise<void> {
        await this.performRequest<void>(Command.Engage, service);
    }

    public async adjustService(service: Handle): Promise<void> {
        await this.performRequest<void>(Command.Adjust, service);
    }

    public async statusService(service: Handle): Promise<Health> {
        return await this.performRequest<Health>(Command.Status, service);
    }

    public async reviewService(service: Handle): Promise<Report> {
        return await this.performRequest<Report>(Command.Review, service);
    }
}
