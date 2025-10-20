import * as vscode from 'vscode';

export class WebpierServiceEditor implements vscode.WebviewViewProvider {
    public static readonly viewType = 'webpierEditor';
    private view?: vscode.WebviewView;

    constructor(private readonly extensionUri: vscode.Uri, private readonly config: any) {}

    public resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, token: vscode.CancellationToken) {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, 'media')]
        };

        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview, this.config);

        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'apply': {
                        vscode.window.showInformationMessage('Form submitted with data: ' + JSON.stringify(data.dervice, null, 2));
                        this.handleFormSubmit(data.dervice);
                        break;
                    }
            }
        });
    }

    private handleFormSubmit(dervice: any) {
        console.log('Service:', dervice.service);
        console.log('Owner:', dervice.owner);
        console.log('Pier:', dervice.pier);
        console.log('Address:', dervice.address);
        console.log('Gateway:', dervice.gateway);
        console.log('Autostart:', dervice.autostart);
        console.log('Obscure:', dervice.obscure);
        console.log('Rendezvous:', dervice.rendezvous);
    }

    private getHtmlForWebview(webview: vscode.Webview, config: any) {
        
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
                                <td><input type="text" id="service" name="service" placeholder="Service name" value="${config.service || ''}"></td>
                            </tr>
                            <tr>
                                <td><label for="owner">Owner:</label></td>
                                <td><input type="text" id="owner" name="owner" placeholder="Owner ID" value="${config.owner || ''}"></td>
                            </tr>
                            <tr>
                                <td><label for="pier">Pier:</label></td>
                                <td><input type="text" id="pier" name="pier" placeholder="Pier ID" value="${config.pier || ''}"></td>
                            </tr>
                            <tr>
                                <td><label for="address">Address:</label></td>
                                <td><input type="text" id="address" name="address" placeholder="Service ip:port" value="${config.address || ''}"></td>
                            </tr>
                            <tr>
                                <td><label for="gateway">Gateway:</label></td>
                                <td><input type="text" id="gateway" name="gateway" placeholder="Tunnel ip:port" value="${config.gateway || ''}"></td>
                            </tr>
                            <tr>
                                <td><label for="rendezvous">Rendezvous:</label></td>
                                <td>
                                    <select id="rendezvous" name="rendezvous">
                                        <option value="email" ${config.rendezvous === '' ? 'selected' : ''}>Email</option>
                                        <option value="dht" ${config.rendezvous !== '' ? 'selected' : ''}>DHT</option>
                                    </select>
                                </td>
                            </tr>
                            <tr id="bootstrapRow" class="${config.rendezvous !== '' ? '' : 'hidden'}">
                                <td><label for="bootstrap">Bootstrap:</label></td>
                                <td><input type="text" id="bootstrap" name="bootstrap" placeholder="DHT bootstrap hosts" value="${config.rendezvous || ''}"></td>
                            </tr>
                            <tr>
                                <td><label for="autostart">Autostart:</label></td>
                                <td><input type="checkbox" id="autostart" name="autostart" ${config.autostart ? 'checked' : ''}></td>
                            </tr>
                            <tr>
                                <td><label for="obscure">Obscure:</label></td>
                                <td><input type="checkbox" id="obscure" name="obscure" ${config.obscure ? 'checked' : ''}></td>
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