import * as vscode from 'vscode';

export class WebpierServiceEditor implements vscode.WebviewViewProvider {
    public static readonly viewType = 'webpierEditor';
    private view?: vscode.WebviewView;

    constructor(private readonly extensionUri: vscode.Uri) {}

    public resolveWebviewView(webviewView: vscode.WebviewView, context: vscode.WebviewViewResolveContext, token: vscode.CancellationToken) {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this.extensionUri]
        };

        webviewView.webview.html = this.getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(data => {
            switch (data.type) {
                case 'submit': {
                        vscode.window.showInformationMessage('Form submitted with data: ' + JSON.stringify(data.values, null, 2));
                        this.handleFormSubmit(data.values);
                        break;
                    }
            }
        });
    }

    private handleFormSubmit(values: any) {
        console.log('Service:', values.service);
        console.log('Owner:', values.owner);
        console.log('Pier:', values.pier);
        console.log('Address:', values.address);
        console.log('Gateway:', values.gateway);
        console.log('Autostart:', values.autostart);
        console.log('Obscure:', values.obscure);
        console.log('Rendezvous:', values.rendezvous);
    }

    private getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>View Provider</title>
    <style>
        body {
            padding: 10px;
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-side-bar-background);
        }
        .form-container {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        table {
            width: 100%;
            border-collapse: collapse;
        }
        td {
            padding: 6px 8px;
            vertical-align: middle;
        }
        td:first-child {
            width: 30%;
            font-size: 13px;
            font-weight: 500;
            color: var(--vscode-foreground);
        }
        td:last-child {
            width: 70%;
        }
        input[type="text"] {
            width: 100%;
            padding: 6px 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            font-size: 13px;
            font-family: var(--vscode-font-family);
            box-sizing: border-box;
        }
        input[type="text"]:focus {
            outline: 1px solid var(--vscode-focusBorder);
            border-color: var(--vscode-focusBorder);
        }
        input[type="checkbox"] {
            width: 16px;
            height: 16px;
            cursor: pointer;
            margin-bottom: 10px;
        }
        select {
            width: 100%;
            padding: 6px 8px;
            background-color: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border);
            border-radius: 2px;
            font-size: 13px;
            font-family: var(--vscode-font-family);
            cursor: pointer;
            box-sizing: border-box;
        }
        select:focus {
            outline: 1px solid var(--vscode-focusBorder);
            border-color: var(--vscode-focusBorder);
        }
        button {
            margin-top: 8px;
            padding: 8px 14px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
            cursor: pointer;
            font-size: 13px;
            font-family: var(--vscode-font-family);
            font-weight: 500;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        button:active {
            background-color: var(--vscode-button-hoverBackground);
            opacity: 0.9;
        }
        .hidden {
            display: none;
        }
    </style>
</head>
<body>
    <div class="form-container">
        <table>
            <tr>
                <td><label for="service">Service:</label></td>
                <td><input type="text" id="service" name="service" placeholder="Service name"></td>
            </tr>
            <tr>
                <td><label for="owner">Owner:</label></td>
                <td><input type="text" id="owner" name="owner" placeholder="Owner ID"></td>
            </tr>
            <tr>
                <td><label for="pier">Pier:</label></td>
                <td><input type="text" id="pier" name="pier" placeholder="Pier ID"></td>
            </tr>
            <tr>
                <td><label for="address">Address:</label></td>
                <td><input type="text" id="address" name="address" placeholder="Service IP:port"></td>
            </tr>
            <tr>
                <td><label for="gateway">Gateway:</label></td>
                <td><input type="text" id="gateway" name="gateway" placeholder="Tunnel IP:port"></td>
            </tr>
            <tr>
                <td><label for="rendezvous">Rendezvous:</label></td>
                <td>
                    <select id="rendezvous" name="rendezvous">
                        <option value="email">Email</option>
                        <option value="dht">DHT</option>
                    </select>
                </td>
            </tr>
            <tr id="bootstrapRow" class="hidden">
                <td><label for="bootstrap">Bootstrap:</label></td>
                <td><input type="text" id="bootstrap" name="bootstrap" placeholder="DHT bootstrap hosts"></td>
            </tr>
            <tr>
                <td><label for="autostart">Autostart:</label></td>
                <td><input type="checkbox" id="autostart" name="autostart"></td>
            </tr>
            <tr>
                <td><label for="obscure">Obscure:</label></td>
                <td><input type="checkbox" id="obscure" name="obscure"></td>
            </tr>
        </table>
        <button id="submitBtn">Apply</button>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        
        // Handle field 'rendezvous' selection change to show/hide 'bootstrapRow'
        const rendezvous = document.getElementById('rendezvous');
        const bootstrapRow = document.getElementById('bootstrapRow');

        rendezvous.addEventListener('change', () => {
            if (rendezvous.value === 'dht') {
                bootstrapRow.classList.remove('hidden');
            } else {
                bootstrapRow.classList.add('hidden');
            }
        });
 
        document.getElementById('submitBtn').addEventListener('click', () => {
            const values = {
                owner: document.getElementById('service').value,
                owner: document.getElementById('owner').value,
                pier: document.getElementById('pier').value,
                address: document.getElementById('address').value,
                gateway: document.getElementById('gateway').value,
                autostart: document.getElementById('autostart').checked,
                obscure: document.getElementById('obscure').checked
            };

            if (rendezvous.value === 'dht') {
                values.rendezvous = document.getElementById('bootstrap').value;
            } else {
                values.rendezvous = '';
            }

            vscode.postMessage({
                type: 'submit',
                values: values
            });
        });

        // Allow Enter key to submit in text fields
        document.querySelectorAll('input[type="text"]').forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    document.getElementById('submitBtn').click();
                }
            });
        });
    </script>
</body>
</html>`;
    }
}