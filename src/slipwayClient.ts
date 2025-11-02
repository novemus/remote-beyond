import * as net from 'net';
import * as os from 'os';
import * as path from 'path';
import * as child from 'child_process';
import * as utils  from './utils';
import * as webpier from './webpierContext';

export class Handle {
    constructor(public readonly pier: string, public readonly service: string) {
    }

    static parseOne(data: any) : Handle {
        return new Handle(data.pier, data.service);
    }

    static parseArray(data: any) : Handle[] {
        const arr: Handle[] = [];
        for (const item of data) {
            arr.push(new Handle(item.pier, item.service));
        }
        return arr;
    }
}

export enum Status {
    Asleep,
    Broken,
    Lonely,
    Burden
};

export class Health {
    constructor(public readonly pier: string, public readonly service: string, public readonly state: Status, public readonly message: string) {
    }

    static parseOne(data: any) : Health {
        return new Health(data.pier, data.service, parseInt(data.state) as Status, data.message);
    }

    static parseArray(data: any) : Health[] {
        const arr: Health[] = [];
        for (const item of data) {
            arr.push(new Health(item.pier, item.service, parseInt(item.state) as Status, item.messageem));
        }
        return arr;
    }
}

export class Tunnel {
    constructor(public readonly pier: string, public readonly pid: number) {
    }

    static parseOne(data: any) : Tunnel {
        return new Tunnel(data.pier, parseInt(data.pid));
    }

    static parseArray(data: any) : Tunnel[] {
        const arr: Tunnel[] = [];
        for (const item of data) {
            arr.push(new Tunnel(item.pier, parseInt(item.pid)));
        }
        return arr;
    }
}

export class Report {
    constructor(public readonly pier: string, public readonly service: string, public readonly state: Status, public readonly message: string, public readonly tunnels: Tunnel[]) {
    }

    static parseOne(data: any) : Report {
        return new Report(
            data.pier, data.service, parseInt(data.state) as Status, data.message, Array.isArray(data.tunnels) ? Tunnel.parseArray(data.tunnels) : []
        );
    }

    static parseArray(data: any) : Report[] {
        const arr: Report[] = [];
        for (const item of data) {
            arr.push(new Report(item.pier, item.service, parseInt(item.state) as Status, item.message, Array.isArray(item.tunnels) ? Tunnel.parseArray(item.tunnels) : []));
        }
        return arr;
    }
};

enum Command {
    Naught,
    Unplug,
    Engage,
    Adjust,
    Status,
    Review
};

class Message {
    public action: Command = Command.Naught;
    public payload: any = '';

    constructor(action: Command, payload?: any) {
        this.action = action;
        this.payload = payload ? payload : '';
    }

    public ok(): boolean {
        return this.action !== Command.Naught && (typeof this.payload !== 'string' || this.payload.toString() === '');
    }

    static pack(msg: Message) : string {
        const data : any = {};
        data.action = msg.action;
        if (msg.payload !== '') {
            data.handle = msg.payload;
        }
        return JSON.stringify(data) + '\n';
    }

    static parse(str: string) : Message {
        const info = JSON.parse(str);
        if (info.error) {
            return new Message(parseInt(info.action) as Command, info.error);
        } else if (info.handle) {
            return new Message(parseInt(info.action) as Command, Array.isArray(info.handle) ? Handle.parseArray(info.handle) : Handle.parseOne(info.handle));
        } else if (info.health) {
            return new Message(parseInt(info.action) as Command, Array.isArray(info.health) ? Health.parseArray(info.health) : Health.parseOne(info.health));
        } else if (info.report) {
            return new Message(parseInt(info.action) as Command, Array.isArray(info.report) ? Report.parseArray(info.report) : Report.parseOne(info.report));
        }
        return new Message(parseInt(info.action) as Command);
    }
};

export class Slipway {
    private socket: string = '';
    private client?: net.Socket;

    constructor(private home: string) {
        this.socket = path.join(os.tmpdir(), os.platform() === 'win32' ? utils.fnv1aHash(home).toString() : utils.murmurHash(home).toString(), 'slipway.jack');
    }

    private async createClient(): Promise<net.Socket> {
        return new Promise((resolve, reject) => {
            const client = net.createConnection({ path: this.socket, timeout: 10000 }, () => {
                console.log('Connected to socket');
                resolve(client);
            });

            client.on('error', (err: Error) => {
                console.error('Could not connect to socket:', err.message);
                reject(err);
            });
        });
    }

    private async request(outcome: Message) : Promise<Message> {
        if (!this.client) {
            this.client = await this.createClient();
        }
        const client = this.client;
        return new Promise((resolve, reject) => {
            client.write(Message.pack(outcome), (err?: Error | null) => {
                if (err) {
                    reject(err);
                } else {
                    client.once('data', (data: Buffer) => {
                        resolve(Message.parse(data.toString()));
                    });
                    client.once('error', (err: Error) => {
                        reject(err);
                    });
                }
            });
        });
    }

    private async performRequest(action: Command, payload?: any) {
        const message = await this.request(new Message(action, payload));
        if (!message.ok()) {
            throw new Error(message.payload.toString());
        }
        return message.payload;
    }

    public async launch() {
        if (this.client) {
            await this.adjustAll();
        } else {
            const slipway = webpier.getModulePath('slipway');
            const server = child.spawn(slipway, [this.home], {
                detached: true,
                stdio: 'ignore',
                windowsHide: true
            });

            console.log(`Spawned server with pid: ${server.pid}`);
            server.unref();
        }
    }

    public async unplugAll() : Promise<void> {
        await this.performRequest(Command.Unplug);
    }

    public async engageAll() : Promise<void> {
        await this.performRequest(Command.Engage);
    }

    public async adjustAll() : Promise<void> {
        await this.performRequest(Command.Adjust);
    }

    public async statusAll() : Promise<Health[]> {
        return await this.performRequest(Command.Status);
    }

    public async reviewAll() : Promise<Report[]> {
        return await this.performRequest(Command.Review);
    }

    public async unplugService(service: Handle) : Promise<void> {
        this.performRequest(Command.Unplug, service);
    }

    public async engageService(service: Handle) : Promise<void> {
        await this.performRequest(Command.Engage, service);
    }

    public async adjustService(service: Handle) : Promise<void> {
        await this.performRequest(Command.Adjust, service);
    }

    public async statusService(service: Handle) : Promise<Health> {
        return await this.performRequest(Command.Status, service);
    }

    public async reviewService(service: Handle) : Promise<Report> {
        return await this.performRequest(Command.Review, service);
    }
}
