(function () {
    const vscode = acquireVsCodeApi();
    document.getElementById('change-context').addEventListener('click', () => {
        const data = {
            pier: document.getElementById('owner').value + '/' + document.getElementById('pier').value,
            autostart: document.getElementById('autostart').checked,
            nat: { 
                stun: document.getElementById('stun').value,
                hops: parseInt(document.getElementById('hops').value)
            },
            dht: {
                bootstrap: document.getElementById('bootstrap').value,
                port: parseInt(document.getElementById('port').value)
            },
            email: {
                smtp: document.getElementById('smtp').value,
                imap: document.getElementById('imap').value,
                login: document.getElementById('login').value,
                password: document.getElementById('password').value,
                cert: document.getElementById('cert').value,
                key: document.getElementById('key').value,
                ca: document.getElementById('ca').value
            }
        };
        vscode.postMessage({
            type: 'change-context',
            context: data
        });
    });
}());
