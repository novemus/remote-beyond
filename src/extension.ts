import * as vscode from 'vscode';
import { ServiceStatus, WebpierService, WebpierDataProvider } from './webpierDataProvider';
import { WebpierServiceEditor } from './webpierServiceEditor';
import { WebpierContextEditor } from './webpierContextEditor';
import * as webpier from './webpierContext';
import * as os from 'os';
import * as fs from 'fs';
import * as path from 'path';

export async function activate(vsc: vscode.ExtensionContext) {
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
		else if(os.platform() === 'darwin') {
			home = path.join(os.homedir(), 'Local Settings', 'Application Data', 'webpier');
		} else {
			home = path.join(os.homedir(), '.webpier');
		}
	}

	home = path.normalize(home);
	const wpc = new webpier.Context(home);

	const imports = new WebpierDataProvider(vsc, wpc, true);
	const exports = new WebpierDataProvider(vsc, wpc, false);

	vscode.window.createTreeView('webpierImport', { treeDataProvider: imports });
	vscode.window.createTreeView('webpierExport', { treeDataProvider: exports });

	if (fs.existsSync(home + '/webpier.json')) {
		try {
			await wpc.load();
			imports.rebuild();
			exports.rebuild();
			vscode.commands.executeCommand('setContext', 'context.uploaded', true);
		} catch (error) {
			vscode.window.showInformationMessage(`Could not load webpier context: ${error}`);
		}
	} else {
		fs.mkdirSync(home, { recursive: true });
	}

	const serviceEditor = new WebpierServiceEditor(vsc.extensionUri, wpc);
	vsc.subscriptions.push(
		vscode.window.registerWebviewViewProvider('webpierServiceEditor', serviceEditor)
	);

	const contextEditor = new WebpierContextEditor(vsc.extensionUri, wpc, imports, exports);
	vsc.subscriptions.push(
		vscode.window.registerWebviewViewProvider('webpierContextEditor', contextEditor)
	);

	vsc.subscriptions.push(vscode.commands.registerCommand('remote-beyond.startService', (item: WebpierService) => {
		item.setStatus(ServiceStatus.Lonely, []);
		item.refresh();
	}));

	vsc.subscriptions.push(vscode.commands.registerCommand('remote-beyond.stopService', (item: WebpierService) => {
		item.setStatus(ServiceStatus.Asleep, []);
		item.refresh();
	}));

	vsc.subscriptions.push(vscode.commands.registerCommand('remote-beyond.openServiceEditor', (item: WebpierService) => {
		vscode.commands.executeCommand('setContext', 'context.edit', null);
		serviceEditor.update(wpc.getService(item.root.remote ? item.pier : wpc.getPier(), item.name), item.root);
		vscode.commands.executeCommand('setContext', 'context.edit', item.root.remote ? 'import' : 'export');
	}));

	vsc.subscriptions.push(vscode.commands.registerCommand('remote-beyond.openContextEditor', () => {
		vscode.commands.executeCommand('setContext', 'context.edit', null);
		vscode.commands.executeCommand('setContext', 'context.edit', 'context');
	}));

	vsc.subscriptions.push(vscode.commands.registerCommand('remote-beyond.delService', (item: WebpierService) => {
		wpc.delService(item.root.remote ? item.pier : wpc.getPier(), item.name);
		item.remove().refresh();
	}));

	vsc.subscriptions.push(vscode.commands.registerCommand('remote-beyond.addImportService', () => {
		vscode.commands.executeCommand('setContext', 'context.edit', null);
		serviceEditor.update(new webpier.Service(), imports);
		vscode.commands.executeCommand('setContext', 'context.edit', 'import');
	}));

	vsc.subscriptions.push(vscode.commands.registerCommand('remote-beyond.addExportService', () => {
		vscode.commands.executeCommand('setContext', 'context.edit', null);
		serviceEditor.update(new webpier.Service(), exports);
		vscode.commands.executeCommand('setContext', 'context.edit', 'export');
	}));

	vsc.subscriptions.push(vscode.commands.registerCommand('remote-beyond.closeEditor', () => {
		vscode.commands.executeCommand('setContext', 'context.edit', null);
	}));

	vsc.subscriptions.push(vscode.commands.registerCommand('remote-beyond.startup', async () => {
		const owner = await vscode.window.showInputBox({
			value: '',
			placeHolder: 'Setup the Owner identifier',
			validateInput: text => {
				return /^[*/\\<>:|?\s]+$/.test(text) ? 'Don\'t use the following symbols: [*/\\<>:|? ]' : null;
			}
		});

		const pier = await vscode.window.showInputBox({
			value: '',
			placeHolder: 'Setup the Pier identifier',
			validateInput: text => {
				return /^[*/\\<>:|?\s]+$/.test(text) ? 'Don\'t use the following symbols: [*/\\<>:|? ]' : null;
			}
		});

		if(owner && pier) {
			try {
				await wpc.init(owner + '/' + pier);
				imports.rebuild();
				exports.rebuild();
				vscode.commands.executeCommand('setContext', 'context.uploaded', true);
				vscode.commands.executeCommand('setContext', 'context.edit', 'context');
			} catch (error) {
				vscode.window.showWarningMessage(`Could not init webpier context: ${error}`);
			}
		} else {
			vscode.window.showWarningMessage('You must define the webpier identity!');
		}
	}));

	vsc.subscriptions.push(vscode.commands.registerCommand('remote-beyond.uploadOffer', async () => {
		const uri = await vscode.window.showOpenDialog({
			canSelectFiles: true,
			title: "Select the WebPier offer"
		});

		vscode.window.showInformationMessage(`Offer: ${uri}`);
	}));

	vsc.subscriptions.push(vscode.commands.registerCommand('remote-beyond.createOffer', async () => {
		const select = await vscode.window.showQuickPick([{ label: 'ssh', description: '127.0.0.1:22', detail: 'Rendezvous: Email' }, { label: 'rdp', description: '127.0.0.1:3389', detail: 'Rendezvous: DHT'}], {
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

	console.log('Extension "remote-beyond" is now active!');
}

export function deactivate() {}
