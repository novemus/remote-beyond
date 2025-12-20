import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

const NETWORK_NAME_PATTERN = /^[a-zA-Z0-9\u0080-\uFFFF]([a-zA-Z0-9\u0080-\uFFFF-]*[a-zA-Z0-9\u0080-\uFFFF])?$/;
const PIER_NAME_PART_PATTERN = /^(?!\\.)(?!com[0-9]$)(?!con$)(?!lpt[0-9]$)(?!nul$)(?!prn$)[^\s\\|\\*\?\\:<>\/$"]*[^\\.\\|\\*\\?\\\:<>\/\s$"]+$/;

export function isIPv4Endpoint(text: string): boolean {
    if (!text) {
        return false;
    }

    const parts = text.trim().split(':');
    if (parts.length !== 2) {
        return false;
    }

    return isValidIPv4(parts[0]) && isValidPort(parts[1]);
}

export function isNetworkEndpoint(text: string): boolean {
    if (!text || text.trim() === '') {
        return false;
    }

    const trimmed = text.trim();

    if (trimmed.startsWith('[')) {
        const closingBracket = trimmed.indexOf(']');
        if (closingBracket === -1) {
            return false;
        }

        const ipPart = trimmed.slice(1, closingBracket);
        const portPart = trimmed.slice(closingBracket + 1);

        if (!isValidIPv6(ipPart)) {
            return false;
        }

        return portPart === '' || (portPart.startsWith(':') && isValidPort(portPart.slice(1)));
    }

    const lastColonIndex = trimmed.lastIndexOf(':');
    if (lastColonIndex === -1) {
        return isValidHostname(trimmed) || isValidIPv4(trimmed);
    }

    const host = trimmed.slice(0, lastColonIndex);
    const portStr = trimmed.slice(lastColonIndex + 1);

    if (!isValidPort(portStr)) {
        return false;
    }

    return isValidHostname(host) || isValidIPv4(host);
}

function isValidHostname(name: string): boolean {
    if (name.length === 0 || name.length > 253) {
        return false;
    }
    const labels = name.split('.');
    for (const label of labels) {
        if (label.length === 0 || label.length > 63) {
            return false;
        }
        if (!NETWORK_NAME_PATTERN.test(label)) {
            return false;
        }
    }
    return true;
}

function isValidPort(portStr: string): boolean {
    const port = parseInt(portStr, 10);
    return !isNaN(port) && port >= 0 && port <= 65535;
}

function isValidIPv4(ip: string): boolean {
    const parts = ip.split('.');
    if (parts.length !== 4) {
        return false;
    }
    return parts.every(part => isValidIPv4Octet(part));
}

function isValidIPv6(ip: string): boolean {
    const regex = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
    return regex.test(ip);
}

function isValidIPv4Octet(octet: string): boolean {
    if (octet === '') {
        return false;
    }
    if (octet.length > 1 && octet[0] === '0') {
        return false;
    }
    const num = parseInt(octet, 10);
    return num >= 0 && num <= 255;
}

export function isNetworkEndpointList(text: string): boolean {
    const list = text.split(',');
    return list.length > 1
        ? list.find(item => !isNetworkEndpoint(item)) === undefined 
        : text.split(';').find(item => !isNetworkEndpoint(item)) === undefined;
}

export function isValidPierNamePart(text: string): boolean {
    return PIER_NAME_PART_PATTERN.test(text);
}

export function isValidPierName(text: string): boolean {
    return isValidPierNamePart(prefix(text, '/')) && isValidPierNamePart(postfix(text, '/'));
}

export function onError(info: string) {
    vscode.window.showErrorMessage(info);
    console.error(info);
}

export async function readJsonFile(file: string): Promise<any> {
    let uri : vscode.Uri;
    if (!path.isAbsolute(file)) {
        if (!vscode.workspace.workspaceFolders) {
            throw new Error('Could not get workspace location');
        }
        uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, file);
    } else {
        uri = vscode.Uri.file(file);
    }

    let data: Uint8Array;
    if (uri.scheme === 'file' && vscode.workspace.workspaceFolders &&
        !uri.toString().startsWith(vscode.workspace.workspaceFolders[0].uri.toString())) {
        // File is outside workspace, use Node.js fs
        data = await fs.readFile(uri.fsPath);
    } else {
        data = await vscode.workspace.fs.readFile(uri);
    }
    return JSON.parse(data.toString());
}

export async function writeJsonFile(file: string, data: any): Promise<void> {
    let uri : vscode.Uri;
    if (!path.isAbsolute(file)) {
        if (!vscode.workspace.workspaceFolders) {
            throw new Error('Could not get workspace location');
        }
        uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, file);
    } else {
        uri = vscode.Uri.file(file);
    }

    const encoder = new TextEncoder();
    const content = encoder.encode(JSON.stringify(data, null, 2));
    if (uri.scheme === 'file' && vscode.workspace.workspaceFolders &&
        !uri.toString().startsWith(vscode.workspace.workspaceFolders[0].uri.toString())) {
        // File is outside workspace, use Node.js fs
        await fs.writeFile(uri.fsPath, content);
    } else {
        await vscode.workspace.fs.writeFile(uri, content);
    }
}

export function prefix(line: string, delim: string) : string {
    const pos = line.indexOf(delim);
    return pos === -1 ? line : line.substring(0, pos);
}

export function postfix(line: string, delim: string) : string {
    const pos = line.indexOf(delim);
    return pos === -1 ? '' : line.substring(pos + 1);
}

export function getNonce(): string {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

export function makeTextHash(str: string): string {
    const fnvPrime: bigint = 1099511628211n;
    const fnvOffsetBasis: bigint = 14695981039346656037n;
    let hash: bigint = fnvOffsetBasis;
    for (let i = 0; i < str.length; i++) {
        hash ^= BigInt(str.charCodeAt(i));
        hash = (hash * fnvPrime) & 0xffffffffffffffffn;
    }
    return hash.toString(16).toUpperCase();
}

export function murmurHash(str: string, seed: bigint = 0xc70f6907n): bigint {
    const m: bigint = 0xc6a4a7935bd1e995n;
    const r: number = 47;

    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const len = data.length;

    let h: bigint = seed ^ ((BigInt(len) * m) & 0xffffffffffffffffn);

    let i = 0;
    while (len - i >= 8) {
        const view = new DataView(data.buffer, i, 8);
        let k: bigint = view.getBigUint64(0, true);
        k = (k * m) & 0xffffffffffffffffn;
        k ^= k >> BigInt(r);
        k = (k * m) & 0xffffffffffffffffn;
        h ^= k;
        h = (h * m) & 0xffffffffffffffffn;
        i += 8;
    }

    const remaining = len - i;
    let tail: bigint = 0n;
    switch (remaining) {
        case 7: tail ^= BigInt(data[i + 6]) << 48n;
        case 6: tail ^= BigInt(data[i + 5]) << 40n;
        case 5: tail ^= BigInt(data[i + 4]) << 32n;
        case 4: tail ^= BigInt(data[i + 3]) << 24n;
        case 3: tail ^= BigInt(data[i + 2]) << 16n;
        case 2: tail ^= BigInt(data[i + 1]) << 8n;
        case 1: tail ^= BigInt(data[i]);
                h ^= tail;
                h = (h * m) & 0xffffffffffffffffn;
    }

    h ^= h >> BigInt(r);
    h = (h * m) & 0xffffffffffffffffn;
    h ^= h >> BigInt(r);

    return h;
}

export class Timer {
    private timeout?: NodeJS.Timeout;

    constructor(private readonly delay: number, private readonly interval: number) {
    }

    start(callback: () => void): void {
        const timer = this;
        timer.stop();
        timer.timeout = setTimeout(() => {
            callback();
            timer.timeout = setInterval(() => {
                callback();
            }, timer.interval);
        }, timer.delay);
    }

    stop(): void {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
    }
}
