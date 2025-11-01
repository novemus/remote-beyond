import * as vscode from 'vscode';
import { WebpierService, WebpierDataProvider } from './webpierDataProvider';
import { WebpierServiceEditor } from './webpierServiceEditor';
import { WebpierContextEditor } from './webpierContextEditor';
import * as slipway from './slipwayClient';
import * as webpier from './webpierContext';
import * as utils from './utils';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

class Controller {
	private home: string;
	private webpierContext: webpier.Context;
	private slipwayClient: slipway.Slipway;
	private importTree: WebpierDataProvider;
	private exportTree: WebpierDataProvider;
	private serviceEditor: WebpierServiceEditor;
	private webpierEditor: WebpierContextEditor;
	private timer: utils.Timer = new utils.Timer(3000, 15000);
	private valid: boolean = true;

	constructor(private context: vscode.ExtensionContext) {
		const config = vscode.workspace.getConfiguration('remote-beyond');

		this.home = config.get<string>('webpier.home', '');
		if (this.home === '') {
			if (os.platform() === 'win32') {
				if (process.env.LOCALAPPDATA) {
					this.home = path.join(process.env.LOCALAPPDATA, 'webpier');
				} else {
					this.home = path.join(os.homedir(), 'AppData', 'Local', 'webpier');
				}
			}
			else if (os.platform() === 'darwin') {
				this.home = path.join(os.homedir(), 'Local Settings', 'Application Data', 'webpier');
			} else {
				this.home = path.join(os.homedir(), '.webpier');
			}
		}

		this.home = path.normalize(this.home);

		this.webpierContext = new webpier.Context(this.home);
		this.slipwayClient = new slipway.Slipway(this.home);

		this.importTree = new WebpierDataProvider(this.webpierContext, true);
		this.exportTree = new WebpierDataProvider(this.webpierContext, false);

		this.serviceEditor = new WebpierServiceEditor(this.context.extensionUri);
		this.webpierEditor = new WebpierContextEditor(this.context.extensionUri);
	}

	async init(pier?: string): Promise<void> {
		try {
			if (pier) {
				if (!fs.existsSync(this.home)) {
					fs.mkdirSync(this.home, { recursive: true });
				}
				await this.webpierContext.init(pier);
			} else {
				if (!fs.existsSync(this.home + '/webpier.json')) {
					return;
				}
				await this.webpierContext.load();
			}
			await this.slipwayClient.launch();
			this.importTree.rebuild();
			this.exportTree.rebuild();
			this.importTree.refresh();
			this.exportTree.refresh();
			this.timer.start(async () => {
				this.refresh();
			});
			vscode.commands.executeCommand('setContext', 'context.init', true);
			if (pier) {
				vscode.commands.executeCommand('setContext', 'context.edit', 'context');
			}
		} catch (err) {
			utils.onError(`Could not init webpier context: ${err}`);
		}
	}

	editContext() {
		vscode.commands.executeCommand('setContext', 'context.edit', null);

		try {
			const webpierContext = this.webpierContext;
			const slipwayClient = this.slipwayClient;
			const pier = this.webpierContext.getPier();
			const importTree = this.importTree;
			const exportTree = this.exportTree;

			this.webpierEditor.setup(this.webpierContext.home, this.webpierContext.getConfig(), async (config: webpier.Config) => {
				try {
					await webpierContext.setConfig(config.pier, config.nat, config.dht, config.email);
					if (config.pier !== pier) {
						importTree.rebuild();
						exportTree.rebuild();
						importTree.refresh();
						exportTree.refresh();
					}

					vscode.commands.executeCommand('setContext', 'context.edit', null);

					try {
						await slipwayClient.adjustAll();
					} catch (err) {
						utils.onError(`Could not adjust services: ${err}`);
					}
				} catch (err) {
					utils.onError(`Could not change some parameters of the context: ${err}`);
				}
			});

			vscode.commands.executeCommand('setContext', 'context.edit', 'context');
		} catch (err) {
			utils.onError(`Could init context editor: ${err}`);
		}
	}

	editService(unit: WebpierService) {
		vscode.commands.executeCommand('setContext', 'context.edit', null);

		try {
			const pier = unit.root.remote ? unit.pier : this.webpierContext.getPier();
			const stale = this.webpierContext.getService(pier, unit.name);
			const webpierContext = this.webpierContext;
			const slipwayClient = this.slipwayClient;

			this.serviceEditor.setup(stale, webpierContext.getRemotes(), async (fresh: webpier.Service) => {
				try {
					await webpierContext.setService(pier, fresh);
					if (stale.name !== fresh.name) {
						await webpierContext.delService(pier, stale.name);
						unit.root.remove(unit);
						unit.root.refresh();
						try {
							await slipwayClient.adjustService(new slipway.Handle(pier, stale.name));
						} catch (err) {
							utils.onError(`Could not adjust the service: ${err}`);
						}
					} else {
						unit.root.remove(unit);
						unit.root.refresh();
					}

					const item = new WebpierService(fresh.name, fresh.pier, fresh.address, unit.root);
					item.root.insert(item);
					item.root.refresh();

					vscode.commands.executeCommand('setContext', 'context.edit', null);

					try {
						await slipwayClient.adjustService(new slipway.Handle(pier, fresh.name));
						if (fresh.autostart) {
							item.setStatus(slipway.Status.Lonely, []);
						}
					} catch (err) {
						item.setStatus(slipway.Status.Broken, []);
						utils.onError(`Could not adjust the service: ${err}`);
					}
				} catch (err) {
					utils.onError(`Could not change service parameters: ${err}`);
				}
			});
			vscode.commands.executeCommand('setContext', 'context.edit', 'service');
		} catch (err) {
			utils.onError(`Could init service editor: ${err}`);
		}
	}

	createService(local: boolean) {
		vscode.commands.executeCommand('setContext', 'context.edit', null);

		const webpierContext = this.webpierContext;
		const slipwayClient = this.slipwayClient;
		const tree = local ? this.exportTree : this.importTree;

		this.serviceEditor.setup(new webpier.Service(local), webpierContext.getRemotes(), async (config: webpier.Service) => {
			try {
				const pier = local ? webpierContext.getPier() : config.pier;
				await webpierContext.setService(pier, config);

				const item = new WebpierService(config.name, config.pier, config.address, tree);
				item.root.insert(item);
				item.root.refresh();

				vscode.commands.executeCommand('setContext', 'context.edit', null);

				try {
					await slipwayClient.adjustService(new slipway.Handle(pier, config.name));
					if (config.autostart) {
						item.setStatus(slipway.Status.Lonely, []);
					}
				} catch (err) {
					item.setStatus(slipway.Status.Broken, []);
					utils.onError(`Could not adjust the service: ${err}`);
				}
			} catch (err) {
				utils.onError(`Could not change service parameters: ${err}`);
			}
		});
		vscode.commands.executeCommand('setContext', 'context.edit', 'service');
	}

	async startService(item: WebpierService): Promise<void> {
		try {
			const pier = item.root.remote ? item.pier : this.webpierContext.getPier();
			await this.slipwayClient.engageService(new slipway.Handle(pier, item.name));
			item.setStatus(slipway.Status.Lonely, []);
			item.refresh();
		} catch (err) {
			utils.onError(`Could not start the service: ${err}`);
		}
	}

	async stopService(item: WebpierService): Promise<void> {
		try {
			const pier = item.root.remote ? item.pier : this.webpierContext.getPier();
			await this.slipwayClient.unplugService(new slipway.Handle(pier, item.name));
			item.setStatus(slipway.Status.Asleep, []);
			item.refresh();
		} catch (err) {
			utils.onError(`Could not stop the service: ${err}`);
		}
	}

	async deleteService(item: WebpierService): Promise<void> {
		try {
			const pier = item.root.remote ? item.pier : this.webpierContext.getPier();
			await this.webpierContext.delService(pier, item.name);
			item.root.remove(item);
			item.root.refresh();
			try {
				await this.slipwayClient.adjustService(new slipway.Handle(item.pier, item.name));
			} catch (err) {
				utils.onError(`Could not unplug the service: ${err}`);
			}
		} catch (err) {
			utils.onError(`Could not delete the service: ${err}`);
		}
	}

	async refresh(): Promise<void> {
		try {
			if (await this.webpierContext.refresh()) {
				this.importTree.rebuild();
				this.exportTree.rebuild();
			}
			const report = await this.slipwayClient.reviewAll();
			this.importTree.updateStatus(report);
			this.exportTree.updateStatus(report);
			this.importTree.refresh();
			this.exportTree.refresh();
			this.valid = true;
		} catch (err) {
			if (this.valid) {
				utils.onError(`Could not refresh webpier context: ${err}`);
			}
			this.valid = false;
		}
	}

	async activate(): Promise<void> {
		await this.init();

		const controller = this;

		vscode.window.createTreeView('webpierImport', { treeDataProvider: this.importTree });
		vscode.window.createTreeView('webpierExport', { treeDataProvider: this.exportTree });

		this.context.subscriptions.push(
			vscode.window.registerWebviewViewProvider('webpierServiceEditor', this.serviceEditor)
		);

		this.context.subscriptions.push(
			vscode.window.registerWebviewViewProvider('webpierContextEditor', this.webpierEditor)
		);

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.startService', (service: WebpierService) => {
			controller.startService(service);
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.stopService', (service: WebpierService) => {
			controller.stopService(service);
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.openServiceEditor', (service: WebpierService) => {
			controller.editService(service);
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.delService', (service: WebpierService) => {
			controller.deleteService(service);
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.addImportService', () => {
			controller.createService(false);
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.addExportService', () => {
			controller.createService(true);
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.openContextEditor', () => {
			controller.editContext();
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.closeEditor', () => {
			vscode.commands.executeCommand('setContext', 'context.edit', null);
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.startup', async () => {
			const owner = await vscode.window.showInputBox({
				value: '',
				placeHolder: 'Setup the Owner identifier',
				validateInput: text => {
					return /^[*/\\<>:|?\s]+$/.test(text) ? 'Don\'t use the following symbols: [*/\\<>:|? ]' : null;
				}
			});

			const host = await vscode.window.showInputBox({
				value: '',
				placeHolder: 'Setup the Host identifier',
				validateInput: text => {
					return /^[*/\\<>:|?\s]+$/.test(text) ? 'Don\'t use the following symbols: [*/\\<>:|? ]' : null;
				}
			});

			if (owner && host) {
				controller.init(owner + '/' + host);
			} else {
				vscode.window.showWarningMessage('You must define the webpier identity!');
			}
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.uploadOffer', async () => {
			const uri = await vscode.window.showOpenDialog({
				canSelectFiles: true,
				title: "Select the WebPier offer"
			});

			vscode.window.showInformationMessage(`Offer: ${uri}`);
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.createOffer', async () => {
			const select = await vscode.window.showQuickPick([{ label: 'ssh', description: '127.0.0.1:22', detail: 'Rendezvous: Email' }, { label: 'rdp', description: '127.0.0.1:3389', detail: 'Rendezvous: DHT' }], {
				title: 'sergey-nine@yandex.ru/antique',
				placeHolder: 'Select services to export',
				canPickMany: true
			});

			vscode.window.showInformationMessage(`Services: ${select}`);

			const uri = await vscode.window.showSaveDialog({
				title: "Save the WebPier offer"
			});

			vscode.window.showInformationMessage(`Offer: ${uri}`);
		}));
	}

	deactivate() {
		this.timer.stop();
	}
}

declare global {
	var controller: Controller | undefined;
}

export async function activate(context: vscode.ExtensionContext) {
	globalThis.controller = new Controller(context);
	await globalThis.controller.activate();
	console.log('Extension "remote-beyond" is now active!');
}

export function deactivate() {
	globalThis.controller?.deactivate();
	globalThis.controller = undefined;
}
