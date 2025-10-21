import * as vscode from 'vscode';
import * as webpier from './webpierContext';
import { WebpierDataProvider } from './webpierDataProvider';

export class WebpierServiceEditor implements vscode.WebviewViewProvider {
    public static readonly viewType = 'webpierEditor';
    private view?: vscode.WebviewView;
    private tree?: WebpierDataProvider;
    private service?: webpier.Service;

    constructor(private readonly extensionUri: vscode.Uri, private readonly wpc: webpier.Context) {}

    public resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, token: vscode.CancellationToken) {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
        };

        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'apply': {
                    this.handleFormSubmit(data.service);
                    break;
                }
            }
        });
    }

    public populate(service: webpier.Service, tree: WebpierDataProvider) {
        this.service = service;
        this.tree = tree;
    }

    private handleFormSubmit(service: webpier.Service) {
        if (this.tree && this.service) {
            const pier = this.wpc.getPier();
            if (this.service.name !== '') {
                this.wpc.delService(this.tree.remote ? this.service.pier : pier, this.service.name);
                this.tree.remove(this.service.name, this.service.pier);
            }
            service.local = this.tree.remote === false;
            this.wpc.setService(this.tree.remote ? service.pier : pier, service);
            this.tree.insert(service.name, service.pier, service.address);
            this.tree.refresh();
            vscode.commands.executeCommand('setContext', 'context.editable', false);
        }
    }

    private getHtmlForWebview(webview: vscode.Webview) {
        const scriptPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'service.js');
		const scriptUri = webview.asWebviewUri(scriptPath);
        const stylesPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'styles.css');
        const stylesUri = webview.asWebviewUri(stylesPath);

        const nonce = getNonce();

        return `<!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <!--
                        Use a content security policy to only allow loading images from https or from our extension directory,
                        and only allow scripts that have a specific nonce.
                    -->
                    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">

                    <meta name="viewport" content="width=device-width, initial-scale=1.0">

                    <link href="${stylesUri}" rel="stylesheet">

                    <title>Service editor</title>
                </head>
                <body>
                    <div class="form-container">
                        <table>
                            <tr>
                                <td><label for="service">Service:</label></td>
                                <td><input type="text" id="service" name="service" placeholder="Service name" value="${this.service?.name || ''}"></td>
                            </tr>
                            <tr>
                                <td><label for="pier">Pier:</label></td>
                                <td><input type="text" id="pier" name="pier" placeholder="Pier ID" value="${this.service?.pier || ''}"></td>
                            </tr>
                            <tr>
                                <td><label for="address">Address:</label></td>
                                <td><input type="text" id="address" name="address" placeholder="Service ip:port" value="${this.service?.address || ''}"></td>
                            </tr>
                            <tr>
                                <td><label for="gateway">Gateway:</label></td>
                                <td><input type="text" id="gateway" name="gateway" placeholder="Tunnel ip:port" value="${this.service?.gateway || ''}"></td>
                            </tr>
                            <tr>
                                <td><label for="rendezvous">Rendezvous:</label></td>
                                <td>
                                    <select id="rendezvous" name="rendezvous">
                                        <option value="email" ${this.service?.rendezvous === '' ? 'selected' : ''}>Email</option>
                                        <option value="dht" ${this.service?.rendezvous !== '' ? 'selected' : ''}>DHT</option>
                                    </select>
                                </td>
                            </tr>
                            <tr id="bootstrapRow" class="${this.service?.rendezvous !== '' ? '' : 'hidden'}">
                                <td><label for="bootstrap">Bootstrap:</label></td>
                                <td><input type="text" id="bootstrap" name="bootstrap" placeholder="DHT bootstrap hosts" value="${this.service?.rendezvous || ''}"></td>
                            </tr>
                            <tr>
                                <td><label for="autostart">Autostart:</label></td>
                                <td><input type="checkbox" id="autostart" name="autostart" ${this.service?.autostart ? 'checked' : ''}></td>
                            </tr>
                            <tr>
                                <td><label for="obscure">Obscure:</label></td>
                                <td><input type="checkbox" id="obscure" name="obscure" ${this.service?.obscure ? 'checked' : ''}></td>
                            </tr>
                        </table>
                        <button id="apply">Apply</button>
                    </div>

                    <script nonce="${nonce}" src="${scriptUri}"></script>
                </body>
                </html>`;
    }
}

function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}