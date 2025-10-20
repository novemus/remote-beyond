import * as vscode from 'vscode';
import { ServiceStatus, WebpierService, WebpierDataProvider } from './webpierDataProvider';
import { WebpierServiceEditor } from './webpierServiceEditor';

async function loadExternalConfig(externalConfigPath: string): Promise<any> {
    if (!vscode.workspace.workspaceFolders) {
        return {}; // No workspace, skip
    }
    const workspaceRoot = vscode.workspace.workspaceFolders[0].uri;
    const configUri = vscode.Uri.joinPath(workspaceRoot, externalConfigPath);

    try {
        const data = await vscode.workspace.fs.readFile(configUri);
        return JSON.parse(data.toString());
    } catch (error) {
        console.warn(`Could not load external config from ${externalConfigPath}:`, error);
        return {}; // File not found or invalid, return empty object
    }
}

export async function activate(context: vscode.ExtensionContext) {
    // Get VSCode configuration
    const config = vscode.workspace.getConfiguration('remoteBeyond');
    const externalConfigPath = config.get<string>('externalConfigPath', './remote-beyond-config.json');

    // Load external config and merge (external overrides VSCode settings)
    const externalConfig = await loadExternalConfig(externalConfigPath);
    const mergedConfig = {
        owner: externalConfig.owner ?? config.get<string>('owner', ''),
        pier: externalConfig.pier ?? config.get<string>('pier', ''),
        service: externalConfig.service ?? config.get<string>('service', 'ssh'),
        address: externalConfig.address ?? config.get<string>('address', '127.0.0.1:22'),
        gateway: externalConfig.gateway ?? config.get<string>('gateway', '0.0.0.0:0'),
        autostart: externalConfig.autostart ?? config.get<boolean>('autostart', true),
        obscure: externalConfig.obscure ?? config.get<boolean>('obscure', true),
        rendezvous: externalConfig.rendezvous ?? config.get<string>('rendezvous', '')
    };

    vscode.commands.executeCommand('setContext', 'context.initialized', true);
    vscode.commands.executeCommand('setContext', 'context.editor', mergedConfig);

	vscode.window.createTreeView('webpierImport', {
		treeDataProvider: new WebpierDataProvider(context, true)
	});

	vscode.window.createTreeView('webpierExport', {
		treeDataProvider: new WebpierDataProvider(context, false)
	});

	// Register the WebpierServiceEditor
	const viewProvider = new WebpierServiceEditor(context.extensionUri);
	context.subscriptions.push(
		vscode.window.registerWebviewViewProvider(WebpierServiceEditor.viewType, viewProvider)
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
