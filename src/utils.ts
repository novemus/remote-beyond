import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs/promises';

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

export function murmurHash(str: string): string {
    const seed: bigint = 0n;
    const m: bigint = 0xc6a4a7935bd1e995n;
    const r: bigint = 47n;
    let h: bigint = seed ^ BigInt(str.length);

    for (let i = 0; i < str.length; i += 8) {
        let k: bigint = 0n;
        for (let j = 0; j < 8 && i + j < str.length; j++) {
            k |= BigInt(str.charCodeAt(i + j)) << BigInt(j * 8);
        }
        k = (k * m) & 0xffffffffffffffffn;
        k ^= k >> r;
        k = (k * m) & 0xffffffffffffffffn;
        h = (h * m) & 0xffffffffffffffffn;
        h ^= k;
    }

    h ^= h >> 13n;
    h = (h * m) & 0xffffffffffffffffn;
    h ^= h >> 15n;

    return h.toString();
}
