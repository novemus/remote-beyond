import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';
import { expect } from 'chai';
import { describe, before, after, it } from 'mocha';
import { Context, Logging, Nat, Dht, Email, Service, Offer, saveOffer, loadOffer } from '../webpierContext';
import { makeTextHash } from '../utils';

describe('Webpier Context Tests', () => {
    let local: string = 'local/server';
    let remote: string = 'remote/client';
    let home: string;
    let context: Context;

    before(async () => {
        home = path.join(os.tmpdir(), 'webpier-test', new Date().getTime().toString());
        context = new Context(home);
        await context.init(local);
    });

    after(() => {
        fs.rmSync(home, { recursive: true });
    });

    it('check empty context', async () => {
        const config = context.getConfig();

        expect(config.pier).to.deep.equal(local);
        expect(config.repo).to.deep.equal(path.join(home, makeTextHash(local)));
        expect(config.log).to.deep.equal({ folder: path.join(home, 'journal'), level: Logging.Debug });
        expect(config.nat).to.deep.equal(new Nat());
        expect(config.dht).to.deep.equal(new Dht());
        expect(config.email).to.deep.equal(new Email());

        expect(fs.existsSync(path.join(home, 'webpier.json'))).to.be.true;
        expect(fs.existsSync(path.join(home, 'webpier.lock'))).to.be.true;
        expect(fs.existsSync(path.join(home, 'journal'))).to.be.true;
        expect(fs.existsSync(path.join(config.repo, local, 'cert.crt'))).to.be.true;
        expect(fs.existsSync(path.join(config.repo, local, 'private.key'))).to.be.true;

        expect(context.getPier()).to.deep.equal(local);
        expect(context.getServices()).to.deep.equal(new Map<string, Service[]>([[local, []]]));
        expect(context.getLocalServices()).to.deep.equal(new Map<string, Service[]>([[local, []]]));
        expect(context.getRemoteServices()).to.deep.equal(new Map<string, Service[]>());
        expect(context.getPierServices(local)).to.deep.equal([]);
        expect(context.getPierServices(remote)).to.deep.equal([]);
        expect(context.getRemotes()).to.deep.equal([]);
        expect(context.getCertificate(local)).to.be.string;
        expect(context.getCertificate(remote)).to.deep.equal('');
        expect(() => context.getService(remote, 'web')).to.throw('Unknown pier');

        await context.load();

        expect(context.getConfig()).to.deep.equal(config);
    });

    it('check reinit context', async () => {
        let another: string = 'another/server';

        await context.init(another);
        let config = context.getConfig();

        expect(config.pier).to.deep.equal(another);
        expect(config.repo).to.deep.equal(path.join(home, makeTextHash(another)));

        await context.init(local);
        config = context.getConfig();

        expect(config.pier).to.deep.equal(local);
        expect(config.repo).to.deep.equal(path.join(home, makeTextHash(local)));
    });

    it('check local services', async () => {
        let service = new Service(true);
        service.name = 'web';
        service.pier = remote;
        service.address = '127.0.0.1:80';

        const config = context.getConfig();

        await context.setService(local, service);
        expect(fs.existsSync(path.join(config.repo, local, 'webpier.json'))).to.be.true;

        expect(context.getService(local, service.name)).to.deep.equal(service);
        expect(context.getPierServices(local)).to.deep.equal([service]);
        expect(context.getServices()).to.deep.equal(new Map<string, Service[]>([[local, [service]]]));
        expect(context.getLocalServices()).to.deep.equal(new Map<string, Service[]>([[local, [service]]]));

        await context.delService(local, service.name);
        expect(() => context.getService(local, service.name)).to.throw('Unknown service');
        expect(context.getServices()).to.deep.equal(new Map<string, Service[]>([[local, []]]));
        expect(context.getLocalServices()).to.deep.equal(new Map<string, Service[]>([[local, []]]));
        expect(context.getPierServices(local)).to.deep.equal([]);
    });

    it('check remote services', async () => {
        let service = new Service(false);
        service.name = 'web';
        service.pier = remote;
        service.address = '127.0.0.1:8888';

        const config = context.getConfig();

        context.addRemote(remote, 'certificate file content');
        await context.setService(remote, service);

        expect(fs.existsSync(path.join(config.repo, remote, 'cert.crt'))).to.be.true;
        expect(fs.existsSync(path.join(config.repo, remote, 'webpier.json'))).to.be.true;

        expect(context.getRemotes()).to.deep.equal([remote]);
        expect(context.getCertificate(remote)).to.deep.equal('certificate file content');
        expect(context.getService(remote, service.name)).to.deep.equal(service);
        expect(context.getPierServices(remote)).to.deep.equal([service]);
        expect(context.getServices()).to.deep.equal(new Map<string, Service[]>([[local, []], [remote, [service]]]));
        expect(context.getRemoteServices()).to.deep.equal(new Map<string, Service[]>([[remote, [service]]]));

        await context.delService(remote, service.name);
        expect(() => context.getService(remote, service.name)).to.throw('Unknown service');
        expect(context.getServices()).to.deep.equal(new Map<string, Service[]>([[local, []], [remote, []]]));
        expect(context.getLocalServices()).to.deep.equal(new Map<string, Service[]>([[local, []]]));
        expect(context.getPierServices(remote)).to.deep.equal([]);

        context.delRemote(remote);
        expect(fs.existsSync(path.join(config.repo, remote, 'cert.crt'))).to.be.false;
        expect(fs.existsSync(path.join(config.repo, remote, 'webpier.json'))).to.be.false;
        expect(context.getCertificate(remote)).to.deep.equal('');
    });

    it('check offers exchange', async () => {
        let service = new Service(true);
        service.name = 'web';
        service.pier = local;
        service.address = '127.0.0.1:80';

        let outcome = new Offer();
        outcome.pier = local;
        outcome.certificate = context.getCertificate(local);
        outcome.services = [{ name: service.name, obscure: service.obscure, rendezvous: service.rendezvous }];

        await saveOffer(path.join(home, 'webpier.offer'), outcome);
        const income = await loadOffer(path.join(home, 'webpier.offer'));

        expect(outcome).to.deep.equal(income);
    });
});
