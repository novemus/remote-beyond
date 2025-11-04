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
			title: 'WebPier identifier',
			placeHolder: 'Enter the Owner identifier',
			prompt: 'Assign your email address to be able to employ the Email rendezvous.',
			validateInput: text => {
				return utils.isValidPeirNamePart(text) ? null : 'Don\'t use the symbols prohibited by file systems and gaps.';
			}
		});

		const host = await vscode.window.showInputBox({
			title: 'WebPier identifier',
			placeHolder: 'Enter the Host identifier',
			prompt: 'The Host identifier must be unique for the Owner.',
			validateInput: text => {
				return utils.isValidPeirNamePart(text) ? null : 'Don\'t use the symbols prohibited by file systems and gaps.';
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
				await this.webpierContext.init(pier);
			} else {
				if (!fs.existsSync(this.home + '/webpier.json')) {
					vscode.commands.executeCommand('setContext', 'context.init', false);
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

			const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);

			status.name = 'Remote-Beyond';
			status.text = `$(home) ${this.webpierContext.getPier()}`;
			status.command = 'webpierImport.focus';
			status.tooltip = `Remote-Beyond: ${this.webpierContext.getPier()}`;
			status.show();

			this.context.subscriptions.push(status);

			if (pier) {
				vscode.commands.executeCommand('remote-beyond.openContextEditor');
			}
		} catch (err) {
			utils.onError(`Could not init webpier context. ${err}`);
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
						utils.onError(`Could not adjust services. ${err}`);
					}
				} catch (err) {
					utils.onError(`Could not change the context. ${err}`);
				}
			});

			vscode.commands.executeCommand('setContext', 'context.edit', 'context');
		} catch (err) {
			utils.onError(`Could setup context editor. ${err}`);
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
							utils.onError(`Could not unplug the service. ${err}`);
						}
					} else {
						unit.root.remove(unit);
						unit.root.refresh();
					}

					const item = new WebpierService(fresh.name, fresh.pier, fresh.address, unit.root);

					try {
						await slipwayClient.adjustService(new slipway.Handle(pier, fresh.name));
						if (fresh.autostart) {
							item.setStatus(slipway.Status.Lonely, '', []);
						}
					} catch (err) {
						item.setStatus(slipway.Status.Broken, (err as Error).name, []);
						utils.onError(`Could not adjust state of the service. ${err}`);
					}

					item.root.insert(item);
					item.root.refresh();
					view.reveal(item, { expand: true, focus: true });

					vscode.commands.executeCommand('setContext', 'context.edit', null);
				} catch (err) {
					utils.onError(`Could not change the service. ${err}`);
				}
			});
			vscode.commands.executeCommand('setContext', 'context.edit', 'service');
		} catch (err) {
			utils.onError(`Could setup service editor. ${err}`);
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
				try {
					await slipwayClient.adjustService(new slipway.Handle(pier, config.name));
					if (config.autostart) {
						item.setStatus(slipway.Status.Lonely, '', []);
					}
				} catch (err) {
					item.setStatus(slipway.Status.Broken, (err as Error).name, []);
					utils.onError(`Could not adjust state of the service. ${err}`);
				}

				item.root.insert(item);
				item.root.refresh();
				view.reveal(item, { expand: true, focus: true });

				vscode.commands.executeCommand('setContext', 'context.edit', null);
			} catch (err) {
				utils.onError(`Could not create the service. ${err}`);
			}
		});
		vscode.commands.executeCommand('setContext', 'context.edit', 'service');
	}

	async startService(item: WebpierService) : Promise<void> {
		try {
			const pier = item.root.remote ? item.pier : this.webpierContext.getPier();
			await this.slipwayClient.engageService(new slipway.Handle(pier, item.name));
			item.setStatus(slipway.Status.Lonely, '', []);
			item.refresh();
		} catch (err) {
			utils.onError(`Could not start the service. ${err}`);
		}
	}

	async stopService(item: WebpierService) : Promise<void> {
		try {
			const pier = item.root.remote ? item.pier : this.webpierContext.getPier();
			await this.slipwayClient.unplugService(new slipway.Handle(pier, item.name));
			item.setStatus(slipway.Status.Asleep, '', []);
			item.refresh();
		} catch (err) {
			utils.onError(`Could not stop the service. ${err}`);
		}
	}

	async deleteService(item: WebpierService) : Promise<void> {
		try {
			const pier = item.root.remote ? item.pier : this.webpierContext.getPier();
			const answer = await vscode.window.showInformationMessage(
				`Do you want to remove ${item.root.remote ? 'import' : 'export'} service '${item.name}'?`,
				'Yes', 'No'
			);
			if (answer !== 'Yes') {
				return;
			}
			await this.webpierContext.delService(pier, item.name);

			try {
				await this.slipwayClient.adjustService(new slipway.Handle(item.pier, item.name));
			} catch (err) {
				utils.onError(`Could not unplug the service. ${err}`);
			}

			item.root.remove(item);
			item.root.refresh();
		} catch (err) {
			utils.onError(`Could not delete the service. ${err}`);
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
				utils.onError(`Could not refresh webpier context. ${err}`);
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
						title: 'Remote-Beyond: Import',
						prompt: `Enter the address for the '${service.name}' service from the '${offer.pier}'.`,
						placeHolder: '127.0.0.1:12345',
						validateInput: (text: string) => {
							return utils.isIPv4Endpoint(text) ? null : 'Enter IP:port pair.';
						}
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
			utils.onError(`Could not refresh webpier context. ${err}`);
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
					detail: `Rendezvous: ${service.rendezvous === '' ? 'Email' : 'DHT'}`
				});
			});
			const selects = await vscode.window.showQuickPick(choice, {
				title: 'Remote-Beyond: Export',
				placeHolder: `Select services you want to export.`,
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
			utils.onError(`Could not refresh webpier context. ${err}`);
		}
	}

	async pickServiceAndExecCommand(command : 'start' | 'stop' | 'edit' | 'delete', local: boolean) : Promise<void> {
		const pool = local ? this.webpierContext.getLocalServices() : this.webpierContext.getRemoteServices();
		const choice: vscode.QuickPickItem[] = [];

		pool.forEach((services, pier) => {
			services.forEach(service => {
				choice.push({
					label: service.name,
					description: service.address,
					detail: pier
				});
			});
		});

		const select = await vscode.window.showQuickPick(choice, {
			title: `Select the service to ${command}`,
			placeHolder: 'Enter service name',
			canPickMany: false
		});

		if (select && select.detail) {
			const item = local 
					   ? this.exportTree.find(select.detail, select.label) 
					   : this.importTree.find(select.detail, select.label);

			if (item === undefined) {
				utils.onError(`Could not find service with name ${select.label} for the ${select.detail} pier.`);
				return;
			}

			switch (command) {
				case 'start':
					await this.startService(item);
					break;
				case 'stop':
					await this.stopService(item);
					break;
				case 'edit':
					this.editService(item);
					break;
				case 'delete':
					await this.deleteService(item);
					break;
			}
		}
	}

	async activate(): Promise<void> {
		const self = this;
		await self.initialize();

		this.context.subscriptions.push(
			vscode.window.registerWebviewViewProvider('webpierServiceEditor', self.serviceEditor)
		);

		this.context.subscriptions.push(
			vscode.window.registerWebviewViewProvider('webpierContextEditor', self.webpierEditor)
		);

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.startImportService', async () => {
			await self.pickServiceAndExecCommand('start', false);
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.startExportService', async () => {
			await self.pickServiceAndExecCommand('start', true);
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.stopImportService', async () => {
			await self.pickServiceAndExecCommand('stop', false);
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.stopExportService', async () => {
			await self.pickServiceAndExecCommand('stop', true);
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.editImportService', async () => {
			await self.pickServiceAndExecCommand('edit', false);
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.editExportService', async () => {
			await self.pickServiceAndExecCommand('edit', true);
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.delImportService', async () => {
			await self.pickServiceAndExecCommand('delete', false);
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.delExportService', async () => {
			await self.pickServiceAndExecCommand('delete', true);
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.startService', async (service: WebpierService) => {
			await self.startService(service);
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.stopService', async (service: WebpierService) => {
			await self.stopService(service);
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.delService', async (service: WebpierService) => {
			await self.deleteService(service);
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.editService', (service: WebpierService) => {
			self.editService(service);
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.addImportService', () => {
			self.createService(false);
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.addExportService', () => {
			self.createService(true);
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.openContextEditor', () => {
			self.editContext();
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.collapseImportTree', () => {
			vscode.commands.executeCommand('workbench.actions.treeView.webpierImport.collapseAll');
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.collapseExportTree', () => {
			vscode.commands.executeCommand('workbench.actions.treeView.webpierExport.collapseAll');
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.closeEditor', () => {
			vscode.commands.executeCommand('setContext', 'context.edit', null);
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.startup', async () => {
			await self.startup();
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.uploadOffer', async () => {
			await self.uploadOffer();
		}));

		this.context.subscriptions.push(vscode.commands.registerCommand('remote-beyond.createOffer', async () => {
			await self.createOffer();
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

	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration((event: vscode.ConfigurationChangeEvent) => {
		if (event.affectsConfiguration('remote-beyond.webpier.home')) {

			console.log('Reboot \'remote-beyond\' extension...');

			deactivate();
			activate(context);

			vscode.window.showInformationMessage('Extension \'Remote-Beyond\' was rebooted due to a change of the webpier home directory!');
		}
	}));

	console.log('Extension \'remote-beyond\' is now active!');
}

export function deactivate() {
	controller.deactivate();
	console.log('Extension \'remote-beyond\' is now inactive!');
}
