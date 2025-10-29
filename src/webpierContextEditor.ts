import * as vscode from 'vscode';
import * as utils from './utils';
import * as webpier from './webpierContext';
import { WebpierDataProvider } from './webpierDataProvider';

export class WebpierContextEditor implements vscode.WebviewViewProvider {
    private view?: vscode.WebviewView;

    constructor(private readonly extensionUri: vscode.Uri, private readonly wpc: webpier.Context, private readonly imports: WebpierDataProvider, private readonly exports: WebpierDataProvider) {}

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

    private async handleFormSubmit(context: any) {
        try {
            const pier = this.wpc.getPier();
            const command = webpier.getModulePath('slipway');
            const args = `"${this.wpc.home}" daemon`;
            const autostart = webpier.verifyAutostart(command, args);

            await this.wpc.setConfig(context.pier, context.nat, context.dht, context.email);
            if (context.pier !== pier) {
                this.imports.rebuild();
                this.exports.rebuild();
                this.imports.refresh();
                this.exports.refresh();
                webpier.revokeAutostart(command, args);
            }

            if (context.pier !== pier || context.autostart !== autostart) {
                if (context.autostart) {
                    webpier.assignAutostart(command, `"${this.wpc.home}" daemon`);
                } else {
                    webpier.revokeAutostart(command, `"${this.wpc.home}" daemon`);
                }
            }

            vscode.commands.executeCommand('setContext', 'context.edit', null);
        } catch (error) {
            vscode.window.showWarningMessage(`Could not change some parameters of the context: ${error}`);
            vscode.commands.executeCommand('setContext', 'context.edit', null);
            vscode.commands.executeCommand('setContext', 'context.edit', 'context');
        }
    }

    private getHtmlForWebview(webview: vscode.Webview) {
        const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'context.js'));
        const stylesUri = webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', 'styles.css'));

        const nonce = utils.getNonce();
        const config = this.wpc.getConfig();
        const autostart = webpier.verifyAutostart(webpier.getModulePath('slipway'), `"${this.wpc.home}" daemon`);

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
                                    <td><input type="text" id="owner" name="owner" placeholder="Enter Owner ID" value="${utils.prefix(config.pier, '/')}"></td>
                                </tr>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="pier">Pier</label></td>
                                    <td><input type="text" id="pier" name="pier" placeholder="Enter Pier ID" value="${utils.postfix(config.pier, '/')}"></td>
                                </tr>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="autostart">Autostart</label></td>
                                    <td><input type="checkbox" id="autostart" name="autostart" ${autostart ? 'checked' : ''}></td>
                                </tr>
                            </table>
                        </details>
                        <details>
                            <summary>NAT</summary>
                            <table>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="stun">STUN server</label></td>
                                    <td><input type="text" id="stun" name="stun" placeholder="Enter STUN server" value="${config.nat.stun}"></td>
                                </tr>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="hops">Punch hops</label></td>
                                    <td><input type="text" id="hops" name="hops" placeholder="Enter max packet TTL to punch NAT" value="${config.nat.hops}"></td>
                                </tr>
                            </table>
                        </details>
                        <details>
                            <summary>DHT</summary>
                            <table>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="bootstrap">Bootstrap</label></td>
                                    <td><input type="text" id="bootstrap" name="bootstrap" placeholder="Enter DHT bootstrap url" value="${config.dht.bootstrap}"></td>
                                </tr>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="port">Port</label></td>
                                    <td><input type="text" id="port" name="port" placeholder="Enter DHT node port" value="${config.dht.port}"></td>
                                </tr>
                            </table>
                        </details>
                        <details>
                            <summary>EMAIL</summary>
                            <table>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="smtp">SMTP</label></td>
                                    <td><input type="text" id="smtp" name="smtp" placeholder="Enter SMTP server" value="${config.email.smtp}"></td>
                                </tr>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="imap">IMAP</label></td>
                                    <td><input type="text" id="imap" name="imap" placeholder="Enter IMAP server" value="${config.email.imap}"></td>
                                </tr>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="login">Login</label></td>
                                    <td><input type="text" id="login" name="login" placeholder="Enter Email login" value="${config.email.login}"></td>
                                </tr>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="password">Password</label></td>
                                    <td><input type="password" id="password" name="password" placeholder="Enter Email password" value="${config.email.password}"></td>
                                </tr>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="cert">Certificate</label></td>
                                    <td><input type="file" id="cert" name="cert" value="${config.email.cert}"></td>
                                </tr>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="key">Key</label></td>
                                    <td><input type="file" id="key" name="key" value="${config.email.key}"></td>
                                </tr>
                                <tr>
                                    <td><span>&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;</span><label for="ca">CA</label></td>
                                    <td><input type="file" id="ca" name="ca" value="${config.email.ca}"></td>
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
