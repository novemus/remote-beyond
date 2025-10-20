import * as vscode from 'vscode';
import { ServiceStatus, WebpierService, WebpierDataProvider } from './webpierDataProvider';
import { ViewProvider } from './viewProvider';

export function activate(context: vscode.ExtensionContext) {

	vscode.commands.executeCommand('setContext', 'context.initialized', true);

	vscode.window.createTreeView('webpierImport', {
		treeDataProvider: new WebpierDataProvider(context, true)
	});

	vscode.window.createTreeView('webpierExport', {
		treeDataProvider: new WebpierDataProvider(context, false)
	});

	// Register the ViewProvider
	const viewProvider = new ViewProvider(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(ViewProvider.viewType, viewProvider)
	);

	context.subscriptions.push(vscode.commands.registerCommand('remoteBeyond.startService', (item: WebpierService) => {
		item.setStatus(ServiceStatus.Lonely, []);
		item.refresh();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('remoteBeyond.stopService', (item: WebpierService) => {
		item.setStatus(ServiceStatus.Asleep, []);
		item.refresh();
	}));

	context.subscriptions.push(vscode.commands.registerCommand('remoteBeyond.startup', async () => {
		const owner = await vscode.window.showInputBox({
			value: '',
			placeHolder: 'Setup the Owner identifier',
			validateInput: text => {
				return /^[*/\\<>:|?\s]+$/.test(text) ? 'Don\'t use the following symbols: [*/\\<>:|? ]' : null;
			}
		});

		vscode.window.showInformationMessage(`Owner: ${owner}`);

		const pier = await vscode.window.showInputBox({
			value: '',
			placeHolder: 'Setup the Pier identifier',
			validateInput: text => {
				return /^[*/\\<>:|?\s]+$/.test(text) ? 'Don\'t use the following symbols: [*/\\<>:|? ]' : null;
			}
		});
		vscode.window.showInformationMessage(`Pier: ${pier}`);
	}));

	console.log('Extension "remote-beyond" is now active!');
}

export function deactivate() {}
