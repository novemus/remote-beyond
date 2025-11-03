import * as vscode from 'vscode';
import * as utils from './utils';
import * as webpier from './webpierContext';

export class WebpierServiceEditor implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private callback?: (service: webpier.Service) => void;
    private service?: webpier.Service;
    private remotes: string[] = [];

    constructor(private readonly extensionUri: vscode.Uri) {}

    public resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, token: vscode.CancellationToken) {
        this.view = webviewView;
        this.view.description =  this.service?.local ? 'EXPORT' : 'IMPORT';

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, 'media')
            ]
        };

        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'change-service': {
                    this.handleFormSubmit(data.service);
                    break;
                }
            }
        });
    }

    public setup(service: webpier.Service, remotes: string[], callback: (service: webpier.Service) => void) {
        this.service = service;
        this.remotes = remotes;
        this.callback = callback;
    }

    private async handleFormSubmit(service: webpier.Service) {
        if (this.callback) {
            if(!utils.isIPv4Endpoint(service.address)) {
                vscode.window.showErrorMessage('Invalid \'Address\' value!');
                return;
            }
            if(!utils.isIPv4Endpoint(service.gateway)) {
                vscode.window.showErrorMessage('Invalid \'Gateway\' value!');
                return;
            }
            this.callback(service);
        }
    }

    private makePierSelector() {
        let selector = '';
        if (this.service?.local) {
            selector = `<div class="dropdown" name="pier">
                            <button id="multi-pier" class="multi-selector" value="${this.service?.pier}">
                                ${this.service?.pier.length === 0 ? '&nbsp;' : this.service?.pier }
                            </button>
                            <div id="dropdown-content" class="dropdown-content">`;
            const selected = this.service?.pier.split(' ');
            for(const pier of this.remotes) {
                selector += `<label>
                                <input type="checkbox" value="${pier}" ${selected?.find((item) => item === pier) ? 'checked' : ''}>
                                <span class="dropdown-label">${pier}</span>
                            </label>`;
            }
            selector += `</div></div>`;
        } else {
            selector = `<select id="single-pier" name="pier">`;
            for(const pier of this.remotes) {
                selector += `<option value="${pier}" ${this.service?.pier === pier ? 'selected' : ''}>${pier}</option>`;
            }
            selector += `</select>`;
        }
        return selector;
    }

    private makeRendezvousSelector() {
        return `<select id="rendezvous" name="rendezvous">
                    <option value="email" ${this.service?.rendezvous === '' ? 'selected' : ''}>Email</option>
                    <option value="dht" ${this.service?.rendezvous !== '' ? 'selected' : ''}>DHT</option>
                </select>`;
    }

    private getHtmlForWebview(webview: vscode.Webview) {
		const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'service.js'));
        const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'styles.css'));

        const nonce = utils.getNonce();

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
                                <td><label for="service">Service</label></td>
                                <td><input type="text" id="service" name="service" placeholder="Service name" value="${this.service?.name || ''}"></td>
                            </tr>
                            <tr>
                                <td><label for="pier">Pier</label></td>
                                <td>${this.makePierSelector()}</td>
                            </tr>
                            <tr>
                                <td><label for="address">Address</label></td>
                                <td><input type="text" id="address" name="address" placeholder="Service ip:port" value="${this.service?.address || ''}"></td>
                            </tr>
                            <tr>
                                <td><label for="gateway">Gateway</label></td>
                                <td><input type="text" id="gateway" name="gateway" placeholder="Tunnel ip:port" value="${this.service?.gateway || ''}"></td>
                            </tr>
                            <tr>
                                <td><label for="rendezvous">Rendezvous</label></td>
                                <td>${this.makeRendezvousSelector()}</td>
                            </tr>
                            <tr id="bootstrapRow" class="${this.service?.rendezvous !== '' ? '' : 'hidden'}">
                                <td><label for="bootstrap">Bootstrap</label></td>
                                <td><input type="text" id="bootstrap" name="bootstrap" placeholder="DHT bootstrap hosts" value="${this.service?.rendezvous || ''}"></td>
                            </tr>
                            <tr>
                                <td><label for="autostart">Autostart</label></td>
                                <td><input type="checkbox" id="autostart" name="autostart" ${this.service?.autostart ? 'checked' : ''}></td>
                            </tr>
                            <tr>
                                <td><label for="obscure">Obscure</label></td>
                                <td><input type="checkbox" id="obscure" name="obscure" ${this.service?.obscure ? 'checked' : ''}></td>
                            </tr>
                        </table>
                        <button class="apply-button" id="change-service">Apply</button>
                    </div>

                    <script nonce="${nonce}" src="${scriptUri}"></script>
                </body>
                </html>`;
    }
}
