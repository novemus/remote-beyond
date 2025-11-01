import * as vscode from 'vscode';
import * as utils from './utils';
import * as webpier from './webpierContext';

export class WebpierContextEditor implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;
    private config: webpier.Config = new webpier.Config();
    private autostart: boolean = false;
    private callback?: (config: webpier.Config) => void;
    private command: string = '';
    private args: string = '';

    constructor(private readonly extensionUri: vscode.Uri) {}

    public resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, token: vscode.CancellationToken) {
        this.view = webviewView;
        this.view.description = 'CONTEXT';

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this.extensionUri, 'media')
            ]
        };

        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'change-context': {
                    this.handleFormSubmit(data.context);
                    break;
                }
            }
        });
    }

    public setup(home: string, config: webpier.Config, callback: (config: webpier.Config) => void) {
        this.config = config;
        this.command = webpier.getModulePath('slipway');
        this.args = `"${home}" daemon`;
        this.autostart = webpier.verifyAutostart(this.command, this.args);
        this.callback = callback;
    }

    private async handleFormSubmit(context: any) {
        if(this.callback) {
            try {
                if (this.autostart !== context.autostart) {
                    if (context.autostart) {
                        webpier.assignAutostart(this.command, this.args);
                    } else {
                        webpier.revokeAutostart(this.command, this.args);
                    }
                }
            } catch (error) {
                utils.onError(`Could update daemon state: ${error}`);
            }

            this.callback(context);
        }
    }

    private getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'context.js'));
        const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'styles.css'));

        const nonce = utils.getNonce();
        return `<!DOCTYPE html>
                <html lang="en">
                <head>
                    <meta charset="UTF-8">
                    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}';">
                    <meta name="viewport" content="width=device-width, initial-scale=1.0">
                    <link href="${stylesUri}" rel="stylesheet">
                    <title>Custom Webview</title>
                </head>
                <body>
                    <div class="form-container">
                        <details open>
                            <summary>PIER</summary>
                            <table>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="owner">Owner</label></td>
                                    <td><input type="text" id="owner" name="owner" placeholder="Enter Owner ID" value="${utils.prefix(this.config.pier, '/')}"></td>
                                </tr>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="pier">Pier</label></td>
                                    <td><input type="text" id="pier" name="pier" placeholder="Enter Pier ID" value="${utils.postfix(this.config.pier, '/')}"></td>
                                </tr>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="autostart">Autostart</label></td>
                                    <td><input type="checkbox" id="autostart" name="autostart" ${this.autostart ? 'checked' : ''}></td>
                                </tr>
                            </table>
                        </details>
                        <details>
                            <summary>NAT</summary>
                            <table>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="stun">STUN server</label></td>
                                    <td><input type="text" id="stun" name="stun" placeholder="Enter STUN server" value="${this.config.nat.stun}"></td>
                                </tr>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="hops">Punch hops</label></td>
                                    <td><input type="text" id="hops" name="hops" placeholder="Enter max packet TTL to punch NAT" value="${this.config.nat.hops}"></td>
                                </tr>
                            </table>
                        </details>
                        <details>
                            <summary>DHT</summary>
                            <table>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="bootstrap">Bootstrap</label></td>
                                    <td><input type="text" id="bootstrap" name="bootstrap" placeholder="Enter DHT bootstrap url" value="${this.config.dht.bootstrap}"></td>
                                </tr>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="port">Port</label></td>
                                    <td><input type="text" id="port" name="port" placeholder="Enter DHT node port" value="${this.config.dht.port}"></td>
                                </tr>
                            </table>
                        </details>
                        <details>
                            <summary>EMAIL</summary>
                            <table>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="smtp">SMTP</label></td>
                                    <td><input type="text" id="smtp" name="smtp" placeholder="Enter SMTP server" value="${this.config.email.smtp}"></td>
                                </tr>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="imap">IMAP</label></td>
                                    <td><input type="text" id="imap" name="imap" placeholder="Enter IMAP server" value="${this.config.email.imap}"></td>
                                </tr>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="login">Login</label></td>
                                    <td><input type="text" id="login" name="login" placeholder="Enter Email login" value="${this.config.email.login}"></td>
                                </tr>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="password">Password</label></td>
                                    <td><input type="password" id="password" name="password" placeholder="Enter Email password" value="${this.config.email.password}"></td>
                                </tr>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="cert">Certificate</label></td>
                                    <td><input type="file" id="cert" name="cert" value="${this.config.email.cert}"></td>
                                </tr>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="key">Key</label></td>
                                    <td><input type="file" id="key" name="key" value="${this.config.email.key}"></td>
                                </tr>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="ca">CA</label></td>
                                    <td><input type="file" id="ca" name="ca" value="${this.config.email.ca}"></td>
                                </tr>
                            </table>
                        </details>
                        <button class="apply-button" id="change-context">Apply</button>
                    </div>
                    <script nonce="${nonce}" src="${scriptUri}"></script>
                </body>
                </html>`;
    }
}
