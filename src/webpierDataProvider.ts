import * as vscode from 'vscode';
import * as webpier from './webpierContext';
import * as utils  from './utils';

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

    constructor(private vsc: vscode.ExtensionContext, private wpc: webpier.Context, public readonly remote: boolean) {
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

    rebuild() : void {
        const local = this.wpc.getPier();
        for(const [pier, services] of this.wpc.getServices()) {
            if (this.remote && pier !== local || !this.remote && pier === local) {
                for(const service of services) {
                    this.services.set(pier + '/' + service.name, new WebpierService(service.name, service.pier, service.address, this));
                };
            }
        };
    }

    remove(name: string, pier: string) : void {
        const key = this.remote ? pier : this.wpc.getPier() + '/' + name;
        this.services.delete(key);
    }

    insert(name: string, pier: string, address: string) : void {
        const key = this.remote ? pier : this.wpc.getPier() + '/' + name;
        this.services.set(key, new WebpierService(name, pier, address, this));
    }
}

export class WebpierNode extends WebpierDataItem {
    constructor(public readonly owner: string, public readonly pier: string, private service: WebpierService) {
        super(owner, vscode.TreeItemCollapsibleState.None);
        this.contextValue = 'webpier.export.node';
        this.description = this.pier;
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
    private nodes: Map<string, WebpierNode> = new Map<string, WebpierNode>();
    constructor(public readonly name: string, public readonly pier: string, public readonly address: string, public readonly root: WebpierDataProvider) {
        super(name, vscode.TreeItemCollapsibleState.Collapsed);
        this.description = this.address;
        this.contextValue = 'webpier.asleep.service';
        this.iconPath = new vscode.ThemeIcon('broadcast', new vscode.ThemeColor('debugIcon.breakpointDisabledForeground'));
        this.tooltip = 'asleep';
        for(const pier of this.pier.split(' ')) {
            this.nodes.set(pier, new WebpierNode(utils.prefix(pier, '/'), utils.postfix(pier, '/'), this));
        };
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

    remove() : WebpierDataProvider {
        this.root.remove(this.name, this.pier);
        return this.root;
    }
}
