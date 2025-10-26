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

    document.getElementById('change-service').addEventListener('click', () => {
        const pier = document.getElementById('single-pier') || document.getElementById('multi-pier');
        const data = {
            name: document.getElementById('service').value,
            pier: pier.value,
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
            type: 'change-service',
            service: data
        });
    });

    const dropSelector = document.querySelectorAll('.dropdown-content input[type="checkbox"]');
    if (dropSelector) {
        document.getElementById('multi-pier').addEventListener('click', () => {
            document.getElementById("dropdown-content").classList.toggle("show");
        });

        window.onclick = (event) => {
            if (!event.target.matches('.dropdown-content input') && !event.target.matches('.dropdown-content label')
                    && !event.target.matches('.dropdown button') && !event.target.matches('.dropdown div') && !event.target.matches('.dropdown span')) {
                const list = document.getElementById("dropdown-content");
                if (list.classList.contains('show')) {
                    list.classList.remove('show');
                }
            }
        };

        dropSelector.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                const button = document.getElementById('multi-pier');
                let selection = '';
                dropSelector.forEach(checkbox => {
                    if (checkbox.checked) {
                        if (selection !== '') {
                            selection += ' ';
                        }
                        selection += checkbox.value;
                    }
                });
                button.value = selection;
                if (selection === '') {
                    selection = '\u00A0';
                }
                button.textContent = selection;
            });
        });
    }
}());
