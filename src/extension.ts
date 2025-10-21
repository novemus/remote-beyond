import * as vscode from 'vscode';
import { ServiceStatus, WebpierService, WebpierDataProvider } from './webpierDataProvider';
import { WebpierServiceEditor } from './webpierServiceEditor';
import * as webpier from './webpierContext';
import * as os from 'os';
import * as fs from 'fs';

export async function activate(vsc: vscode.ExtensionContext) {
	const home = os.homedir() + '/.webpier';
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

	const editor = new WebpierServiceEditor(vsc.extensionUri, wpc);
	vsc.subscriptions.push(
		vscode.window.registerWebviewViewProvider(WebpierServiceEditor.viewType, editor)
	);

	vsc.subscriptions.push(vscode.commands.registerCommand('remote-beyond.startService', (item: WebpierService) => {
		item.setStatus(ServiceStatus.Lonely, []);
		item.refresh();
	}));

	vsc.subscriptions.push(vscode.commands.registerCommand('remote-beyond.stopService', (item: WebpierService) => {
		item.setStatus(ServiceStatus.Asleep, []);
		item.refresh();
	}));

	vsc.subscriptions.push(vscode.commands.registerCommand('remote-beyond.editService', (item: WebpierService) => {
		editor.populate(wpc.getService(item.root.remote ? item.pier : wpc.getPier(), item.name), item.root);
		vscode.commands.executeCommand('setContext', 'context.editable', true);
	}));

	vsc.subscriptions.push(vscode.commands.registerCommand('remote-beyond.delService', (item: WebpierService) => {
		wpc.delService(item.root.remote ? item.pier : wpc.getPier(), item.name);
		item.remove().refresh();
	}));

	vsc.subscriptions.push(vscode.commands.registerCommand('remote-beyond.addImportService', () => {
		editor.populate(new webpier.Service(), imports);
		vscode.commands.executeCommand('setContext', 'context.editable', true);
	}));

	vsc.subscriptions.push(vscode.commands.registerCommand('remote-beyond.addExportService', () => {
		editor.populate(new webpier.Service(), exports);
		vscode.commands.executeCommand('setContext', 'context.editable', true);
	}));

	vsc.subscriptions.push(vscode.commands.registerCommand('remote-beyond.closeEditor', () => {
		vscode.commands.executeCommand('setContext', 'context.editable', false);
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

		try {
			await wpc.init(owner + '/' + pier);
			imports.rebuild();
			exports.rebuild();
			vscode.commands.executeCommand('setContext', 'context.uploaded', true);
		} catch (error) {
			vscode.window.showInformationMessage(`Could not init webpier context: ${error}`);
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
		const select = await vscode.window.showQuickPick([{ label: '127.0.0.1:22', description: 'ssh', detail: 'Rendezvous: Email' }, { label: '127.0.0.1:3389', description: 'rdp', detail: 'Rendezvous: DHT'}], {
			title: 'sergey-nine@yandex.ru/antique',
			placeHolder: 'Select local services to export',
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
