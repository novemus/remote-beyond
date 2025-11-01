import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

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

export async function writeJsonFile(file: string, data: any) {
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
    return pos === -1 ? line : line.substring(0, line.indexOf(delim));
}

export function postfix(line: string, delim: string) : string {
    const pos = line.indexOf(delim);
    return pos === -1 ? '' : line.substring(pos + 1);
}

export function getNonce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

export function fnv1aHash(str: string) {
    const fnvPrime: bigint = 1099511628211n;
    const fnvOffsetBasis: bigint = 14695981039346656037n;
    let hash: bigint = fnvOffsetBasis;
    for (let i = 0; i < str.length; i++) {
        hash ^= BigInt(str.charCodeAt(i));
        hash = (hash * fnvPrime) & 0xffffffffffffffffn;
    }
    return hash;
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

    start(callback: () => void) {
        const timer = this;
        timer.stop();
        timer.timeout = setTimeout(() => {
            callback();
            timer.timeout = setInterval(() => {
                callback();
            }, timer.interval);
        }, timer.delay);
    }

    stop() {
        if (this.timeout) {
            clearTimeout(this.timeout);
        }
    }
}
