import { expect } from 'chai';
import { describe, it, beforeEach, afterEach } from 'mocha';
import * as net from 'net';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import * as utils from '../utils';
import { Handle, Health, Tunnel, Report, Slipway, Status, Command } from '../slipwayClient';

class MockServer {
    private server: net.Server;
    private onDataCallback: ((data: string) => string | object) | null = null;

    constructor(private readonly socketPath: string) {
        this.server = net.createServer((socket) => {
            socket.on('data', (data) => {
                const request = data.toString().trim();
                let response: string | object = '';

                if (this.onDataCallback) {
                    response = this.onDataCallback(request);
                }

                socket.write(JSON.stringify(response) + '\n');
                socket.end();
            });
        });
    }

    public start(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.server.listen(this.socketPath, () => {
                resolve();
            });
            this.server.on('error', reject);
        });
    }

    public stop(): Promise<void> {
        return new Promise((resolve) => {
            this.server.close(() => {
                if (os.platform() !== 'win32') {
                    try {
                        require('fs').unlinkSync(this.socketPath);
                    } catch (e) {}
                }
                resolve();
            });
        });
    }

    public onData(callback: (data: string) => string | object) {
        this.onDataCallback = callback;
    }
}

function getTestSocketPath(home: string): string {
    const hash = utils.makeTextHash(home);
    if (os.platform() === 'win32') {
        return `\\\\.\\pipe\\${hash}.slipway`;
    } else {
        return path.join(fs.existsSync('/tmp') ? '/tmp' : os.tmpdir(), `${hash}.slipway`);
    }
}

describe('Slipway Client Tests', () => {
    const testHome = '/test/home';
    const socketPath = getTestSocketPath(testHome);
    let mockServer: MockServer;
    let slipway: Slipway;

    beforeEach(() => {
        mockServer = new MockServer(socketPath);
        slipway = new Slipway(testHome);
    });

    afterEach(async () => {
        if (slipway) {
            (slipway as any).client?.destroy();
        }
        if (mockServer) {
            await mockServer.stop().catch(() => {});
        }
    });

    it('should send request with no handle to get all services', async () => {
        const mockHealth: Health[] = [
            new Health('owner/host', 'web', Status.Asleep, 'OK'),
        ];

        mockServer.onData((data) => {
            const req = JSON.parse(data);
            expect(req.action).to.equal(Command.Status);
            expect(req.handle).to.be.undefined;
            return { action: Command.Status, health: mockHealth };
        });

        await mockServer.start();

        const result = await slipway.statusAll();
        expect(result).to.deep.equal(mockHealth);
    });

    it('should send request with handle for specific service', async () => {
        const handle = new Handle('owner/host', 'web');
        const expectedHealth = new Health('owner/host', 'web', Status.Asleep, 'OK');

        mockServer.onData((data) => {
            const req = JSON.parse(data);
            expect(req.action).to.equal(Command.Status);
            expect(req.handle).to.deep.equal({
                pier: 'owner/host',
                service: 'web'
            });
            return { action: Command.Status, health: expectedHealth };
        });

        await mockServer.start();

        const result = await slipway.statusService(handle);
        expect(result).to.deep.equal(expectedHealth);
    });

    it('should pack engage request correctly', async () => {
        mockServer.onData((data) => {
            const req = JSON.parse(data);
            expect(req.action).to.equal(Command.Engage);
            return { action: Command.Engage };
        });

        await mockServer.start();
        await slipway.engageAll();
    });

    it('should pack unplug request with handle correctly', async () => {
        const handle = new Handle('owner/host', 'web');

        mockServer.onData((data) => {
            const req = JSON.parse(data);
            expect(req.action).to.equal(Command.Unplug);
            expect(req.handle).to.deep.equal({
                pier: 'owner/host',
                service: 'web'
            });
            return { action: Command.Unplug };
        });

        await mockServer.start();
        await slipway.unplugService(handle);
    });

    it('should handle error when server returns error field', async () => {
        mockServer.onData(() => {
            return { action: Command.Status, error: 'Service unavailable' };
        });

        await mockServer.start();

        try {
            await slipway.statusAll();
            expect.fail('Expected error');
        } catch (err: any) {
            expect(err.message).to.include('Service unavailable');
        }
    });

    it('should parse report with tunnels correctly', async () => {
        const handle = new Handle('owner/host', 'web');
        const mockReport = new Report(
            'owner/host',
            'web',
            Status.Burden,
            'burden',
            [new Tunnel('owner/host', 12345)]
        );

        mockServer.onData((data) => {
            const req = JSON.parse(data);
            expect(req.action).to.equal(Command.Review);
            expect(req.handle).to.deep.equal({
                pier: 'owner/host',
                service: 'web'
            });
            return { action: Command.Review, report: mockReport };
        });

        await mockServer.start();

        const result = await slipway.reviewService(handle);
        expect(result).to.deep.equal(mockReport);
    });

    it('should request all reports when no handle provided', async () => {
        const mockReports: Report[] = [
            new Report('owner/host', 'web', Status.Asleep, 'asleep', []),
        ];

        mockServer.onData((data) => {
            const req = JSON.parse(data);
            expect(req.action).to.equal(Command.Review);
            expect(req.handle).to.be.undefined;
            return { action: Command.Review, report: mockReports };
        });

        await mockServer.start();

        const result = await slipway.reviewAll();
        expect(result).to.deep.equal(mockReports);
    });
});
