import * as vscode from 'vscode';
import * as path from 'path';

export async function readJsonFile(file: string): Promise<any> {
    let uri : vscode.Uri = vscode.Uri.parse(file);
    if (!path.isAbsolute(file)) {
        if (!vscode.workspace.workspaceFolders) {
            throw new Error('Could not get workspace location');
        }
        uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, file);
    }

    const data = await vscode.workspace.fs.readFile(uri);
    return JSON.parse(data.toString());
}

export async function writeJsonFile(file: string, data: any) {
    let uri : vscode.Uri = vscode.Uri.parse(file);
    if (!path.isAbsolute(file)) {
        if (!vscode.workspace.workspaceFolders) {
            throw new Error('Could not get workspace location');
        }
        uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, file);
    }

    const encoder = new TextEncoder();
    await vscode.workspace.fs.writeFile(uri, encoder.encode(JSON.stringify(data, null, 2)));
}

export function prefix(line: string, delim: string) : string {
    const pos = line.indexOf(delim);
    return pos === -1 ? line : line.substring(0, line.indexOf(delim));
}

export function postfix(line: string, delim: string) : string {
    const pos = line.indexOf(delim);
    return pos === -1 ? '' : line.substring(pos + 1);
}
