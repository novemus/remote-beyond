import * as vscode from 'vscode';
import * as os from 'os';
import * as child from 'child_process';
import * as fs from 'fs';
import * as ext from 'fs-ext';
import * as forge from 'node-forge';
import * as reg from '@vscode/windows-registry';
import * as utils  from './utils';

export class StaleContext extends Error {
    public cause: string = 'stale webpier context';
}

class Locker {
    private fd: number;
    private mtime?: Date;

    constructor(file: string) {
        this.fd = fs.openSync(file, 'w');
    }

    hardLock() {
        ext.flockSync(this.fd, 'ex');
        if (!this.mtime || fs.fstatSync(this.fd).mtime.toISOString() !== this.mtime.toISOString()) {
            throw new StaleContext();
        }
        this.mtime = new Date();
        fs.futimesSync(this.fd, this.mtime, this.mtime);
    }

    softLock() {
        ext.flockSync(this.fd, 'sh');
        this.mtime = fs.fstatSync(this.fd).mtime;
    }

    release() {
        ext.flockSync(this.fd, 'un');
    }
}

export enum Logging {
    None,
    Fatal,
    Error,
    Warning,
    Info,
    Debug,
    Trace
};

export class Journal {
    public folder: string = '';
    public level: Logging = Logging.Debug;
    
    static parse(object: any) : Journal {
        const result = new Journal();
        result.folder = object.folder;
        result.level = parseInt(object.level) as Logging;
        return result;
    }
}

export class Nat {
    public stun: string = 'stun.ekiga.net';
    public hops: number = 7;
    
    static parse(object: any) : Nat {
        const result = new Nat();
        result.stun = object.stun;
        result.hops = parseInt(object.hops);
        return result;
    }
}

export class Dht {
    public bootstrap: string = 'bootstrap.jami.net';
    public port: number = 0;
    
    static parse(object: any) : Dht {
        const result = new Dht();
        result.bootstrap = object.bootstrap;
        result.port = parseInt(object.port);
        return result;
    }
}

export class Email {
    public smtp: string = '';
    public imap: string = '';
    public login: string = '';
    public password: string = '';
    public cert: string = '';
    public key: string = '';
    public ca: string = '';
    
    static parse(object: any) : Email {
        const result = new Email();
        result.smtp = object.smtp;
        result.imap = object.imap;
        result.login = object.login;
        result.password = object.password;
        result.cert = object.cert;
        result.key = object.key;
        result.ca = object.ca;
        return result;
    }
}

export class Config {
    public pier: string = '';
    public repo: string = '';
    public log: Journal = new Journal();
    public nat: Nat = new Nat();
    public dht: Dht = new Dht();
    public email: Email = new Email();

    static parse(object: any) : Config {
        const result = new Config();
        result.pier = object.pier;
        result.repo = object.repo;
        result.log = Journal.parse(object.log);
        result.nat = Nat.parse(object.nat);
        result.dht = Dht.parse(object.dht);
        result.email = Email.parse(object.email);
        return result;
    }
}

export class Service {
    public local: boolean = false;
    public name: string = '';
    public pier: string = '';
    public address: string = '';
    public gateway: string = '0.0.0.0:0';
    public rendezvous: string = 'bootstrap.jami.net';
    public autostart: boolean = false;
    public obscure: boolean = true;

    constructor(local: boolean) {
        this.local = local;
    }

    static parse(object: any) : Service {
        const result = new Service(object.local.toString().toLowerCase() === 'true');
        result.name = object.name;
        result.pier = object.pier;
        result.address = object.address;
        result.gateway = object.gateway;
        result.rendezvous = object.rendezvous;
        result.autostart = object.autostart.toString().toLowerCase() === 'true';
        result.obscure = object.obscure.toString().toLowerCase() === 'true';
        return result;
    }

    static parseArray(array: any[]) : Service[] {
        const result: Service[] = [];
        for(const object of array) {
            result.push(Service.parse(object));
        }
        return result;
    }
};

export class Context {
    private config: Config = new Config();
    private services: Map<string, Service[]> = new Map<string, Service[]>();
    private locker: Locker;

    constructor(public readonly home: string) {
        this.locker = new Locker(this.home + '/webpier.lock');
    }

    public async init(pier: string) {
        this.config.pier = pier;
        this.config.repo = this.home + '/' + Array.prototype.map.call(new TextEncoder().encode(pier), x => ('00' + x.toString(16)).slice(-2)).join('');

        this.services = new Map<string, Service[]>();

        if (fs.existsSync(this.config.repo + '/' + pier + '/private.key')) {
            this.locker.hardLock();
            try {
                await utils.writeJsonFile(this.home + '/webpier.json', this.config);
                this.locker.release();
            } catch (err) {
                this.locker.release();
                throw err;
            }
            await this.load();
        } else {
            this.config.log.folder = this.home + '/journal';
            this.config.log.level = Logging.Debug;

            this.services.set(pier, []);

            const { publicKey, privateKey } = forge.pki.rsa.generateKeyPair(2048);

            const cert = forge.pki.createCertificate();

            cert.publicKey = publicKey;
            cert.serialNumber = new Date().getTime().toString(16);
            cert.validity.notBefore = new Date();
            cert.validity.notAfter = new Date();
            cert.validity.notAfter.setFullYear(cert.validity.notBefore.getFullYear() + 5);

            const attrs = [{
                name: 'commonName',
                value: pier
            }];

            cert.setSubject(attrs);
            cert.setIssuer(attrs);
            cert.sign(privateKey);

            fs.mkdirSync(this.home, { recursive: true });
            fs.mkdirSync(this.config.log.folder, { recursive: true });

            this.locker.hardLock();
            try {
                await utils.writeJsonFile(this.home + '/webpier.json', this.config);
                fs.mkdirSync(this.config.repo + '/' + pier, { recursive: true });
                fs.writeFileSync(this.config.repo + '/' + pier + '/cert.crt', forge.pki.certificateToPem(cert));
                fs.writeFileSync(this.config.repo + '/' + pier + '/private.key', forge.pki.privateKeyToPem(privateKey));
                this.locker.release();
            } catch (err) {
                this.locker.release();
                throw err;
            }
        }
    }

    public async load() : Promise<void> {
        this.locker.softLock();
        try {
            this.config = Config.parse(await utils.readJsonFile(this.home + '/webpier.json'));
            this.services.set(this.config.pier, []);
            for(const email of fs.readdirSync(this.config.repo, { withFileTypes: true })) {
                if (email.isDirectory()) {
                    for(const host of fs.readdirSync(email.parentPath + '/' + email.name, { withFileTypes: true })) {
                        const pier = email.name + '/' + host.name;
                        const conf = this.config.repo + '/' + pier + '/webpier.json';
                        if (host.isDirectory() && fs.existsSync(conf)) {
                            const config = await utils.readJsonFile(conf);
                            this.services.set(pier, Service.parseArray(config.services));
                        }
                    }
                }
            }
            this.locker.release();
        } catch (err) {
            this.locker.release();
            throw err;
        }
    }

    public async refresh() : Promise<boolean> {
        try {
            this.locker.hardLock();
            this.locker.release();

        } catch (err) {
            this.locker.release();
            if (err instanceof StaleContext) {
                await this.load();
                return true;
            }
            throw err;
        }
        return false;
    }

    public getPier() : string {
        return this.config.pier;
    }

    public getConfig() : Config {
        return JSON.parse(JSON.stringify(this.config));
    }

    public async setConfig(pier: string, nat: Nat, dht: Dht, email: Email) {
        this.config.nat = JSON.parse(JSON.stringify(nat));
        this.config.dht = JSON.parse(JSON.stringify(dht));
        this.config.email = JSON.parse(JSON.stringify(email));
        if (pier !== this.config.pier) {
            await this.init(pier);
        } else {
            this.locker.hardLock();
            try {
                await utils.writeJsonFile(this.home + '/webpier.json', this.config);
                this.locker.release();
            } catch (err) {
                this.locker.release();
                throw err;
            }
        }
    }

    public getServices() : Map<string, Service[]> {
        const result = new Map<string, Service[]>();
        this.services.forEach((services, pier) => {
            result.set(pier, JSON.parse(JSON.stringify(services)));
        });
        return result;
    }

    public getService(pier: string, name: string) : Service {
        const pool = this.services.get(pier);
        if (pool) {
            const service = pool.find((item) => item.name === name);
            if (service) {
                return JSON.parse(JSON.stringify(service));
            }
            throw new Error('Unknown service');
        }
        throw new Error('Unknown pier');
    }

    public async setService(pier: string, info: Service) {
        info.local = this.config.pier === pier;
        let services = this.services.get(pier);
        if (services) {
            services = services.filter((service) => service.name !== info.name);
            services.push(info);
            this.services.set(pier, services);
            this.locker.hardLock();
            try {
                await utils.writeJsonFile(this.config.repo + '/' + pier + '/webpier.json', { services });
                this.locker.release();
            } catch (err) {
                this.locker.release();
                throw err;
            }
        } else {
            throw new Error('Unknown pier');
        }
    }

    public async delService(pier: string, name: string) {
        let services = this.services.get(pier);
        if (services) {
            services = services.filter((service) => service.name !== name);
            this.services.set(pier, services);
            this.locker.hardLock();
            try {
                await utils.writeJsonFile(this.config.repo + '/' + pier + '/webpier.json', { services });
                this.locker.release();
            } catch (err) {
                this.locker.release();
                throw err;
            }
        }
    }

    public getRemotes() : string[] {
        const piers: string[] = [];
        this.services.forEach((_, pier) => {
            if (pier !== this.config.pier) {
                piers.push(pier);
            }
        });
        return piers;
    }

    public setRemote(pier: string, cert: string) {
        const dir = this.config.repo + '/' + pier;
        if (pier !== this.config.pier && !fs.existsSync(dir)) {
            this.locker.hardLock();
            try {
                fs.mkdirSync(dir, { recursive: true });
                fs.writeFileSync(dir + '/cert.crt', cert);
                this.locker.release();
            } catch (err) {
                this.locker.release();
                throw err;
            }
        } else {
            throw new Error('Wrong pier');
        }
    }

    public delRemote(pier: string) {
        if (pier === this.config.pier) {
            throw new Error('Wrong pier');
        }
        const dir = this.config.repo + '/' + pier;
        if (fs.existsSync(dir)) {
            this.locker.hardLock();
            try {
                fs.rmSync(dir, { recursive: true, force: true });
                this.locker.release();
            } catch (err) {
                this.locker.release();
                throw err;
            }
        }
    }
};

export function getModulePath(name: string) : string {
    let conf = os.platform() === 'darwin' ? '/Applications/WebPier.app/Contents/Resources/webpier.conf' 
             : os.platform() === 'win32' ? 'Software\\WebPier' : '/etc/webpier/webpier.conf';

    const config = vscode.workspace.getConfiguration('remote-beyond');
    if (config.has('webpier.config')) {
        const custom = config.get<string>('webpier.config', '');
        if (custom !== '') {
            conf = custom;
        }
    }

    if (os.platform() === 'win32') {
        const path = reg.GetStringRegKey('HKEY_LOCAL_MACHINE', conf, name);
        if (path) {
            return path;
        }
    } else {
        const data = fs.readFileSync(conf, { encoding: 'utf-8' });
        for(const line of data.split('\n')) {
            if (line.startsWith(name + '=')) {
                return utils.postfix(line, '=');
            }
        }
    }
    throw Error(`Could not find path to module: ${name}`);
}

export function verifyAutostart(command: string, args: string) : boolean {
    if (os.platform() === 'win32') {
        const result = child.spawnSync('schtasks', [
            '/Query',
            '/TN',
            '\\WebPier\\Task #' + utils.fnv1aHash(command + args).toString(),
            '/HRESULT'
        ], { windowsHide: true });

        return result.status === 0;
    } else {
        const record = '@reboot ' + command + ' ' + args;

        const result = child.spawnSync('crontab', ['-l'], { windowsHide: true });
        if (result.status !== 0) {
            throw new Error(result.stderr.toString());
        }

        const data = result.stdout.toString();
        for(const line of data.split('\n')) {
            if (line === record) {
                return true;
            }
        }

        return false;
    }
}

export function assignAutostart(command: string, args: string) {
    if (os.platform() === 'win32') {
        var config =
`<?xml version="1.0" encoding="UTF-16"?>
<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">
    <RegistrationInfo>
        <Date>${new Date().toISOString()}</Date>
        <Author>WebPier</Author>
        <Description>WebPier backend service</Description>
    </RegistrationInfo>
    <Triggers>
        <BootTrigger>
            <Enabled>true</Enabled>
            <Delay>PT30S</Delay>
        </BootTrigger>
    </Triggers>
    <Principals>
        <Principal id="Author">
            <LogonType>S4U</LogonType>
            <RunLevel>LeastPrivilege</RunLevel>
        </Principal>
    </Principals>
    <Settings>
        <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>
        <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>
        <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>
        <AllowHardTerminate>true</AllowHardTerminate>
        <StartWhenAvailable>true</StartWhenAvailable>
        <RunOnlyIfNetworkAvailable>false</RunOnlyIfNetworkAvailable>
        <IdleSettings>
            <StopOnIdleEnd>false</StopOnIdleEnd>
            <RestartOnIdle>false</RestartOnIdle>
        </IdleSettings>
        <AllowStartOnDemand>true</AllowStartOnDemand>
        <Enabled>true</Enabled>
        <Hidden>false</Hidden>
        <RunOnlyIfIdle>false</RunOnlyIfIdle>
        <WakeToRun>true</WakeToRun>
        <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>
        <Priority>4</Priority>
        <RestartOnFailure>
            <Interval>PT1M</Interval>
            <Count>30</Count>
        </RestartOnFailure>
    </Settings>
    <Actions Context="Author">
        <Exec>
            <Command>${command.replace(/"/g, '&quot;').replace(/'/g, '&apos;')}</Command>
            <Arguments>${args.replace(/"/g, '&quot;').replace(/'/g, '&apos;')}</Arguments>
        </Exec>
    </Actions>
</Task>`.replace(/\r?\n/g, '\r\n');

        const id = utils.fnv1aHash(command + args).toString();
        const xml = os.tmpdir()  + '\\' + id + '.xml';

        fs.writeFileSync(xml, config, { encoding: 'utf-8' });

        const result = child.spawnSync('powershell',
            [
                '-command', 
                `Start-Process schtasks -ArgumentList '/Create /TN "\\WebPier\\Task #${id}" /XML "${xml}" /HRESULT' -Verb RunAs`
            ]
        );

        if (result.status !== 0) {
            throw new Error(result.stderr.toString());
        }
    } else {
        const record = '@reboot ' + command + ' ' + args;

        const list = child.spawnSync('crontab', ['-l'], { windowsHide: true });
        if (list.status !== 0) {
            throw new Error(list.stderr.toString());
        }

        const data = list.stdout.toString();
        for(const line of data.split('\n')) {
            if (line === record) {
                return;
            }
        }

        const opts: child.SpawnSyncOptions = { input: record + '\n' + data, windowsHide: true  };
        const edit = child.spawnSync('crontab', opts);
        if (edit.status !== 0) {
            throw new Error(edit.stderr.toString());
        }
    }
}

export function revokeAutostart(command: string, args: string) {
    if (os.platform() === 'win32') {
        const id = utils.fnv1aHash(command + args).toString();
        const result = child.spawnSync('powershell',
            [
                '-command', 
                `Start-Process schtasks -ArgumentList '/Delete /TN "\\WebPier\\Task #${id}" /F /HRESULT' -Verb RunAs`
            ]
        );

        if (result.status !== 0) {
            throw new Error(result.stderr.toString());
        }
    } else {
        const record = '@reboot ' + command + ' ' + args;

        let list = child.spawnSync('crontab', ['-l'], { windowsHide: true });
        if (list.status !== 0) {
            throw new Error(list.stderr.toString());
        }

        const data = list.stdout.toString().split('\n').filter(line => line !== record);

        const opts: child.SpawnSyncOptions = { input: data.join('\n'), windowsHide: true };
        const edit = child.spawnSync('crontab', opts);
        if (edit.status !== 0) {
            throw new Error(edit.stderr.toString());
        }
    }
}
