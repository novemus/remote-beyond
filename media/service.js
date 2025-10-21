(function () {
    const vscode = acquireVsCodeApi();

    const rendezvous = document.getElementById('rendezvous');
    const bootstrapRow = document.getElementById('bootstrapRow');

    rendezvous.addEventListener('change', () => {
        if (rendezvous.value === 'dht') {
            bootstrapRow.classList.remove('hidden');
        } else {
            bootstrapRow.classList.add('hidden');
        }
    });

    document.getElementById('apply').addEventListener('click', () => {
        const data = {
            name: document.getElementById('service').value,
            pier: document.getElementById('pier').value,
            address: document.getElementById('address').value,
            gateway: document.getElementById('gateway').value,
            autostart: document.getElementById('autostart').checked,
            obscure: document.getElementById('obscure').checked
        };

        if (rendezvous.value === 'dht') {
            data.rendezvous = document.getElementById('bootstrap').value;
        } else {
            data.rendezvous = '';
        }

        vscode.postMessage({
            type: 'apply',
            service: data
        });
    });

    document.querySelectorAll('input[type="text"]').forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                document.getElementById('apply').click();
            }
        });
    });
}());