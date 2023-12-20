import { promises as fsPromises } from 'fs';
import path from 'path';
import JSZip from 'jszip';
import { exec } from 'child_process';
import { gitdir, log, waitFor } from './common';

export async function writeBufferToFile(buffer: Buffer, filename: string) {
    try {
        await fsPromises.writeFile(filename, buffer);
        log(`File "${filename}" written successfully.`);
    } catch (error) {
        log(`Error writing file: ${error}`);
    }
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
    const promises: any[] = [];

    for (const [_, file] of Object.entries(zip.files)) {
        if (file.dir) {
            const folderPath = path.join(destPath, file.name);
            promises.push(fsPromises.mkdir(folderPath, { recursive: true }));
        } else {
            promises.push(
                (async () => {
                    const filePath = path.join(destPath, file.name);

                    // Ensure the directory for the file exists
                    const dirPath = path.dirname(filePath);
                    await fsPromises.mkdir(dirPath, { recursive: true });

                    const content = await file.async('nodebuffer');
                    fsPromises.writeFile(filePath, content);
                })()
            );
        }
    }

    await Promise.all(promises);

    await waitFor(1000);

    return true;
}

export async function getGitTrackedFiles() {
    return new Promise<string[]>((resolve, reject) => {
        exec('git ls-files', { encoding: 'utf-8' }, (error, stdout) => {
            if (error) {
                reject(new Error('Error getting git tracked files'));
            } else {
                resolve(stdout.trim().split('\n'));
            }
        });
    });
}

export async function zipRepoJsZip(
    mainPath: string,
    zipRoot: string,
    folderToZip?: string,
    ignoreFiles?: string[]
) {
    if (!folderToZip) folderToZip = zipRoot;

    const ignoreFilesList = ignoreFiles ?? [];

    const filesToInclude: string[] = [];

    // loop to walk the path to pack
    const walk = async (currentPath: string) => {
        const items = await fsPromises.readdir(currentPath);

        for (const item of items) {
            const itemPath = path.join(currentPath, item);

            if (
                ignoreFilesList.some((ignorePath) =>
                    itemPath.startsWith(ignorePath)
                )
            ) {
                continue;
            }

            const stats = await fsPromises.stat(itemPath);

            if (stats.isDirectory()) {
                await walk(itemPath);
            } else {
                filesToInclude.push(itemPath);
            }
        }
    };

    await walk(gitdir);

    const gitTrackedFiles = await getGitTrackedFiles();

    filesToInclude.push(...gitTrackedFiles);

    const zip = new JSZip();

    // add files found to be included for packing
    for (const file of filesToInclude) {
        const content = await fsPromises.readFile(file);
        const relativePath = path.join(
            mainPath ? mainPath + '/' : '',
            path.relative(zipRoot, file)
        );
        zip.file(relativePath, content);
    }

    // return final packed buffer
    return await zip.generateAsync({ type: 'nodebuffer' });
}
