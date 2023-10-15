import fs from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { waitFor } from './common';

export function writeBufferToFile(buffer: Buffer, filename: string) {
    try {
        fs.writeFileSync(filename, buffer);
        console.log(`File "${filename}" written successfully.`);
    } catch (error) {
        console.error('Error writing file: ', error);
    }
}

function loadIgnoreList(rootPath: string) {
    const gitignorePath = path.join(rootPath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
        const gitignoreContent = fs.readFileSync(gitignorePath, 'utf-8');
        return gitignoreContent
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith('#'));
    }
    return [];
}

export type UnpackGitRepoOptions = {
    destPath: string;
    arrayBuffer: ArrayBuffer;
};

export async function unpackGitRepo({
    destPath,
    arrayBuffer,
}: UnpackGitRepoOptions) {
    const zip = await JSZip.loadAsync(arrayBuffer);

    zip.forEach(async (_, file) => {
        if (file.dir) {
            const folderPath = path.join(destPath, file.name);
            fs.mkdirSync(folderPath, { recursive: true });
        } else {
            const filePath = path.join(destPath, file.name);
            const content = await file.async('blob');
            fs.writeFileSync(
                filePath,
                new Uint8Array(await content.arrayBuffer())
            );
        }
    });

    await waitFor(1000);

    return true;
}

export async function zipRepoJsZip(
    mainPath: string,
    zipRoot: string,
    folderToZip?: string,
    useGitignore?: boolean
) {
    if (!folderToZip) folderToZip = zipRoot;

    const ignoreSet = new Set(useGitignore ? loadIgnoreList(zipRoot) : []);

    const zip = new JSZip();

    const filesToInclude: string[] = [];

    const walk = (currentPath: string) => {
        const items = fs.readdirSync(currentPath);

        for (const item of items) {
            const itemPath = path.join(currentPath, item);

            if (ignoreSet.has(item)) {
                continue;
            }

            if (fs.statSync(itemPath).isDirectory()) {
                walk(itemPath);
            } else {
                filesToInclude.push(itemPath);
            }
        }
    };
    walk(folderToZip);

    for (const file of filesToInclude) {
        const content = fs.readFileSync(file);
        const relativePath = `${mainPath ? mainPath + '/' : ''}${path.relative(
            zipRoot,
            file
        )}`;
        zip.file(relativePath, content);
    }

    return await zip.generateAsync({ type: 'nodebuffer' });
}
