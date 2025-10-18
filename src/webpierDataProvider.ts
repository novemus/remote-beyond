import * as vscode from 'vscode';

export enum ServiceStatus {
    Asleep,
    Broken,
    Lonely,
    Burden
}

export abstract class WebpierDataItem extends vscode.TreeItem {
    abstract getChildren() : vscode.ProviderResult<WebpierDataItem[]>;
    abstract refresh(item?: WebpierDataItem) : void;
}

export class WebpierDataProvider implements vscode.TreeDataProvider<WebpierDataItem> {
    private services: Map<string, WebpierService> = new Map<string, WebpierService>();
    private _onDidChangeTreeData: vscode.EventEmitter<WebpierDataItem | undefined | null | void> = new vscode.EventEmitter<WebpierDataItem | undefined | null | void>(); 
    readonly onDidChangeTreeData: vscode.Event<WebpierDataItem | undefined | null | void> = this._onDidChangeTreeData.event;
    constructor(context: vscode.ExtensionContext, remote: boolean) {

        if (remote) {
            const nodes1: Map<string, WebpierNode> = new Map<string, WebpierNode>();
            const nodes2: Map<string, WebpierNode> = new Map<string, WebpierNode>();

            const serv1 = new WebpierService('ssh', '127.0.0.1:2222', nodes1, this);
            const serv2 = new WebpierService('rdp', '127.0.0.1:33389', nodes2, this);

            this.services.set('ssh', serv1);
            this.services.set('rdp', serv2);

            nodes1.set('s1001', new WebpierNode('sergey-nine@yandex.ru', 's1001', serv1));
            nodes2.set('antique', new WebpierNode('sergey-nine@yandex.ru', 'antique', serv2));

            serv1.setStatus(ServiceStatus.Broken, []);
            serv2.setStatus(ServiceStatus.Burden, ['antique']);
        } else {
            const nodes1: Map<string, WebpierNode> = new Map<string, WebpierNode>();
            const nodes2: Map<string, WebpierNode> = new Map<string, WebpierNode>();

            const serv1 = new WebpierService('ssh', '127.0.0.1:22', nodes1, this);
            const serv2 = new WebpierService('rdp', '127.0.0.1:3389', nodes2, this);

            this.services.set('ssh', serv1);
            this.services.set('rdp', serv2);

            nodes1.set('s1001', new WebpierNode('sergey-nine@yandex.ru', 's1001', serv1));
            nodes1.set('antique', new WebpierNode('sergey-nine@yandex.ru', 'antique', serv1));

            nodes2.set('s1001', new WebpierNode('sergey-nine@yandex.ru', 's1001', serv2));
            nodes2.set('antique', new WebpierNode('sergey-nine@yandex.ru', 'antique', serv2));

            serv1.setStatus(ServiceStatus.Broken, []);
            serv2.setStatus(ServiceStatus.Burden, ['s1001']);
        }
    }

    getTreeItem(element: WebpierDataItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: WebpierDataItem): vscode.ProviderResult<WebpierDataItem[]> {
        if (element) {
            return element.getChildren();
        }

        return Promise.resolve([...this.services.values()]);
    }

    refresh(item?: WebpierDataItem): void {
        this._onDidChangeTreeData.fire(item);
    }
}

export class WebpierNode extends WebpierDataItem {
    constructor(public readonly owner: string, public readonly pier: string, private service: WebpierService) {
        super(pier, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'webpier.export.node';
        this.description = this.owner;
        this.tooltip = this.owner + '/' + this.pier;
        this.iconPath = new vscode.ThemeIcon('plug', new vscode.ThemeColor('debugIcon.breakpointDisabledForeground'));
    }

    getChildren() : vscode.ProviderResult<WebpierDataItem[]> {
        return Promise.resolve([]);
    }

    refresh(item?: WebpierDataItem) : void {
        this.service.refresh(item ? item : this);
    }

    setStatus(connected: boolean) {
        this.iconPath = new vscode.ThemeIcon('plug', new vscode.ThemeColor(connected ? 'debugIcon.startForeground' : 'debugIcon.breakpointDisabledForeground'));
    }
}

export class WebpierService extends WebpierDataItem {
    constructor(public readonly name: string, public readonly address: string, private nodes: Map<string, WebpierNode>, private root: WebpierDataProvider) {
        super(address, vscode.TreeItemCollapsibleState.Collapsed);
        this.description = this.name;
        this.contextValue = 'webpier.asleep.service';
    }

    setStatus(status: ServiceStatus, tunnels: string[]) {
        this.contextValue = 'webpier.' + (status === ServiceStatus.Asleep ? 'asleep' : 'active') + '.service';
        switch(status) {
            case ServiceStatus.Broken:
                this.iconPath = new vscode.ThemeIcon('broadcast', new vscode.ThemeColor('debugIcon.stopForeground'));
                this.tooltip = 'broken';
                break;
            case ServiceStatus.Lonely:
                this.iconPath = new vscode.ThemeIcon('broadcast', new vscode.ThemeColor('debugIcon.continueForeground'));
                this.tooltip = 'lonely';
                break;
            case ServiceStatus.Burden:
                this.iconPath = new vscode.ThemeIcon('broadcast', new vscode.ThemeColor('debugIcon.startForeground'));
                this.tooltip = 'burden';
                break;
            default:
                this.iconPath = new vscode.ThemeIcon('broadcast', new vscode.ThemeColor('debugIcon.breakpointDisabledForeground'));
                this.tooltip = 'asleep';
                break;
        }
        this.nodes.forEach((value, key) => {
            value.setStatus(tunnels.includes(key));
        });
    }

    getChildren() : vscode.ProviderResult<WebpierDataItem[]> {
        return Promise.resolve([...this.nodes.values()]);
    }

    refresh(item?: WebpierDataItem) : void {
        this.root.refresh(item ? item : this);
    }
}
