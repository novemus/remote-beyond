import * as vscode from 'vscode';
import { WebpierDataItem, WebpierService, WebpierDataProvider } from './webpierDataProvider';
import { WebpierServiceEditor } from './webpierServiceEditor';
import { WebpierContextEditor } from './webpierContextEditor';
import * as slipway from './slipwayClient';
import * as webpier from './webpierContext';
import * as utils from './utils';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

function getHome() : string {
	const config = vscode.workspace.getConfiguration('remote-beyond');
	let home = config.get<string>('webpier.home', '');
	if (home === '') {
		if (os.platform() === 'win32') {
			if (process.env.LOCALAPPDATA) {
				home = path.join(process.env.LOCALAPPDATA, 'webpier');
			} else {
				home = path.join(os.homedir(), 'AppData', 'Local', 'webpier');
			}
		}
		else if (os.platform() === 'darwin') {
			home = path.join(os.homedir(), 'Local Settings', 'Application Data', 'webpier');
		} else {
			home= path.join(os.homedir(), '.webpier');
		}
	}
	return path.normalize(home);
}

class Controller {
	private home: string;
	private webpierContext: webpier.Context;
	private slipwayClient: slipway.Slipway;
	private importTree: WebpierDataProvider;
	private exportTree: WebpierDataProvider;
	private importView: vscode.TreeView<WebpierDataItem>;
	private exportView: vscode.TreeView<WebpierDataItem>;
	private serviceEditor: WebpierServiceEditor;
	private webpierEditor: WebpierContextEditor;
	private timer: utils.Timer = new utils.Timer(3000, 15000);
	private valid: boolean = true;

	constructor(private context: vscode.ExtensionContext) {
		this.home = getHome();

		this.webpierContext = new webpier.Context(this.home);
		this.slipwayClient = new slipway.Slipway(this.home);

		this.importTree = new WebpierDataProvider(this.webpierContext, true);
		this.exportTree = new WebpierDataProvider(this.webpierContext, false);

		this.importView = vscode.window.createTreeView('webpierImport', { treeDataProvider: this.importTree });
		this.exportView = vscode.window.createTreeView('webpierExport', { treeDataProvider: this.exportTree });

		this.serviceEditor = new WebpierServiceEditor(this.context.extensionUri);
		this.webpierEditor = new WebpierContextEditor(this.context.extensionUri);
	}

	async startup() : Promise<void> {
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
			this.initialize(owner + '/' + host);
		} else {
			vscode.window.showWarningMessage('You must define the webpier identity!');
		}
	}
	async initialize(pier?: string) : Promise<void> {
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

	editContext() : void {
		vscode.commands.executeCommand('setContext', 'context.edit', null);

		try {
			const webpierContext = this.webpierContext;
			const slipwayClient = this.slipwayClient;
			const pier = this.webpierContext.getPier();
			const importTree = this.importTree;
			const exportTree = this.exportTree;

			this.webpierEditor.setup(this.home, this.webpierContext.getConfig(), async (config: webpier.Config) => {
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

	editService(unit: WebpierService) : void {
		vscode.commands.executeCommand('setContext', 'context.edit', null);

		try {
			const pier = unit.root.remote ? unit.pier : this.webpierContext.getPier();
			const stale = this.webpierContext.getService(pier, unit.name);
			const webpierContext = this.webpierContext;
			const slipwayClient = this.slipwayClient;
			const view = unit.root.remote ? this.importView : this.exportView;

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

					view.reveal(item, { expand: true, focus: true });
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

	createService(local: boolean) : void {
		vscode.commands.executeCommand('setContext', 'context.edit', null);

		const webpierContext = this.webpierContext;
		const slipwayClient = this.slipwayClient;
		const tree = local ? this.exportTree : this.importTree;
		const view = local ? this.exportView : this.importView;

		this.serviceEditor.setup(new webpier.Service(local), webpierContext.getRemotes(), async (config: webpier.Service) => {
			try {
				const pier = local ? webpierContext.getPier() : config.pier;
				await webpierContext.setService(pier, config);

				const item = new WebpierService(config.name, config.pier, config.address, tree);
				item.root.insert(item);
				item.root.refresh();

				view.reveal(item, { expand: true, focus: true });
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

	async startService(item: WebpierService) : Promise<void> {
		try {
			const pier = item.root.remote ? item.pier : this.webpierContext.getPier();
			await this.slipwayClient.engageService(new slipway.Handle(pier, item.name));
			item.setStatus(slipway.Status.Lonely, []);
			item.refresh();
		} catch (err) {
			utils.onError(`Could not start the service: ${err}`);
		}
	}

	async stopService(item: WebpierService) : Promise<void> {
		try {
			const pier = item.root.remote ? item.pier : this.webpierContext.getPier();
			await this.slipwayClient.unplugService(new slipway.Handle(pier, item.name));
			item.setStatus(slipway.Status.Asleep, []);
			item.refresh();
		} catch (err) {
			utils.onError(`Could not stop the service: ${err}`);
		}
	}

	async deleteService(item: WebpierService) : Promise<void> {
		try {
			const pier = item.root.remote ? item.pier : this.webpierContext.getPier();
			const answer = await vscode.window.showInformationMessage(
				`Do you want to remove ${item.root.remote ? 'import' : 'export'} service "${item.name}"?`,
				'Yes', 'No'
			);
			if (answer !== 'Yes') {
				return;
			}
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

	async refresh() : Promise<void> {
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

	async uploadOffer() : Promise<void> {
		try {
			const uri = await vscode.window.showOpenDialog({
				canSelectFiles: true,
				title: "Select WebPier offer"
			});

			if (uri) {
				const offer = await webpier.loadOffer(uri[0].fsPath);
				if (offer.pier === this.webpierContext.getPier()) {
					vscode.window.showErrorMessage(`The pier name is the same as the local pier: ${offer.pier}`);
					return;
				}

				const cert = this.webpierContext.getCertificate(offer.pier);
				if (cert !== offer.certificate) {
					if (cert !== '') {
						const answer = await vscode.window.showWarningMessage(
							'Such a pier exists and has a different certificate. Do you want to replace it and its services?',
							'Yes', 'No'
						);
						if (answer !== 'Yes') {
							return;
						}
						this.webpierContext.delRemote(offer.pier);
					}
					this.webpierContext.addRemote(offer.pier, offer.certificate);
				}
				for(const service of offer.services) {
					const address = await vscode.window.showInputBox({
						title: offer.pier,
						prompt: `Enter the address for the '${service.name}' service from the '${offer.pier}' pier.`,
						placeHolder: '127.0.0.1:12345'
					});

					if (address && address !== '') {
						const info = new webpier.Service(false);
						info.name = service.name;
						info.pier = offer.pier;
						info.address = address;
						info.obscure = service.obscure;
						info.rendezvous = service.rendezvous;

						await this.webpierContext.setService(offer.pier, info);

						const item = new WebpierService(info.name, info.pier, info.address, this.importTree);
						this.importTree.insert(item);
						this.importTree.refresh();
						this.importView.reveal(item, { expand: true, focus: false });
					}
				}
			}
		} catch (err) {
			utils.onError(`Could not refresh webpier context: ${err}`);
		}
	}

	async createOffer() : Promise<void> {
		try {
			const pier = this.webpierContext.getPier();
			const services = this.webpierContext.getPierServices(this.webpierContext.getPier());
			const choice: vscode.QuickPickItem[] = [];
			services.forEach(service => {
				choice.push({
					label: service.name,
					description: service.address,
					detail: service.rendezvous
				});
			});
			const selects = await vscode.window.showQuickPick(choice, {
				title: pier,
				placeHolder: 'Select services to export',
				canPickMany: true
			});

			if (selects) {
				const uri = await vscode.window.showSaveDialog({
					title: "Save WebPier offer"
				});
				if(uri) {
					const offer = new webpier.Offer();
					offer.pier = pier;
					offer.certificate = this.webpierContext.getCertificate(pier);
					selects.forEach(item => {
						const service = services.find(service => service.name === item.label);
						if (service) {
							offer.services.push({
								name: service.name,
								obscure: service.obscure,
								rendezvous: service.rendezvous
							});
						}
					});
					await webpier.saveOffer(uri.fsPath, offer);
				}
			}
		} catch (err) {
			utils.onError(`Could not refresh webpier context: ${err}`);
		}
	}

	async activate(): Promise<void> {
		const controller = this;
		await controller.initialize();

		this.context.subscriptions.push(
			vscode.window.registerWebviewViewProvider('webpierServiceEditor', controller.serviceEditor)
		);

		this.context.subscriptions.push(
			vscode.window.registerWebviewViewProvider('webpierContextEditor', controller.webpierEditor)
		);

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.startService', async (service: WebpierService) => {
			await controller.startService(service);
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.stopService', async (service: WebpierService) => {
			await controller.stopService(service);
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.delService', async (service: WebpierService) => {
			await controller.deleteService(service);
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.openServiceEditor', (service: WebpierService) => {
			controller.editService(service);
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
			await controller.startup();
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.uploadOffer', async () => {
			await controller.uploadOffer();
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.createOffer', async () => {
			await controller.createOffer();
		}));
	}

	deactivate() {
		this.timer.stop();
		this.context.subscriptions.forEach(item => { item.dispose(); });
	}
}

let controller: Controller;

export async function activate(context: vscode.ExtensionContext) {
	controller = new Controller(context);
	controller.activate();
	console.log('Extension "remote-beyond" is now active!');
}

export function deactivate() {
	controller.deactivate();
	console.log('Extension "remote-beyond" is now inactive!');
}
