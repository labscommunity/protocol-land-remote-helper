import { ArweaveSigner, createData } from 'arbundles';
import readline from 'node:readline';
import fs, { promises as fsPromises } from 'fs';
import { getThresholdCost, getWallet, initArweave, log } from './common';
import type { Tag } from '../types';
import { withAsync } from './withAsync';
import type { JsonWebKey } from 'crypto';

export async function getAddress(wallet?: JsonWebKey) {
    return await initArweave().wallets.jwkToAddress(
        wallet ? wallet : getWallet()
    );
}

export function getActivePublicKey() {
    const wallet = getWallet();
    if (!wallet) {
        process.exit(0);
    }
    return wallet.n;
}

async function checkAccessToTty() {
    try {
        await fsPromises.access(
            '/dev/tty',
            fs.constants.F_OK | fs.constants.R_OK | fs.constants.W_OK
        );
        return true;
    } catch (err) {
        return false;
    }
}

function createTtyReadlineInterface() {
    const ttyReadStream = fs.createReadStream('/dev/tty');
    const ttyWriteStream = fs.createWriteStream('/dev/tty');

    const rl = readline.createInterface({
        input: ttyReadStream,
        output: ttyWriteStream,
    });

    return {
        rl,
        ttyReadStream,
        ttyWriteStream,
    };
}

function askQuestionThroughTty(question: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const { rl, ttyReadStream, ttyWriteStream } =
            createTtyReadlineInterface();

        rl.question(question, (answer: string) => {
            rl.close();
            ttyReadStream.destroy();
            ttyWriteStream.end();
            ttyWriteStream.on('finish', () => {
                resolve(answer.trim().toLowerCase());
            });
        });

        rl.on('error', (err) => reject(err));
        ttyReadStream.on('error', (err) => reject(err));
        ttyWriteStream.on('error', (err) => reject(err));
    });
}

const shouldPushChanges = async (
    uploadSize: number,
    uploadCost: number,
    subsidySize: number
) => {
    let hasAccessToTty = await checkAccessToTty();

    // If no access to TTY, proceed with push by default.
    if (!hasAccessToTty) return true;

    const thresholdCost = getThresholdCost();

    let showPushConsent;

    if (thresholdCost === null) {
        // No threshold: Show consent only if above strategy's subsidy.
        showPushConsent = uploadSize > subsidySize;
    } else if (uploadCost > thresholdCost) {
        // Above Threshold: Show consent only if above strategy's subsidy.
        showPushConsent = uploadSize > subsidySize;
    } else {
        // Below Threshold: Don't show consent.
        showPushConsent = false;
    }

    // If no consent needed, proceed with push.
    if (!showPushConsent) return true;

    // Ask for user consent through TTY.
    try {
        const answer = await askQuestionThroughTty(' [PL] Push? (y/n): ');
        return answer === 'yes' || answer === 'y';
    } catch (err) {
        return true;
    }
};

export async function uploadRepo(
    zipBuffer: Buffer,
    tags: Tag[],
    uploadSize: number,
    uploadCost: number
) {
    async function attemptUpload(
        subsidySize: number,
        uploaderName: string,
        uploader: (buffer: Buffer, tags: Tag[]) => Promise<string>
    ) {
        const pushChanges = await shouldPushChanges(
            uploadSize,
            uploadCost,
            subsidySize
        );
        if (pushChanges) {
            const txId = await uploader(zipBuffer, tags);
            log(`Posted Tx to ${uploaderName}: ${txId}`);
            return txId;
        }
    }

    try {
        const subsidySize = 500 * 1024; // 500KB;
        return await attemptUpload(subsidySize, 'Turbo', turboUpload);
    } catch (error) {
        return await attemptUpload(0, 'Arweave', arweaveUpload);
    }
}

export async function arweaveDownload(txId: string) {
    const { response, error } = await withAsync(() =>
        fetch(`https://arweave.net/${txId}`)
    );

    if (error) {
        throw new Error(error as string);
    } else if (response) {
        return await response.arrayBuffer();
    }
}

async function arweaveUpload(zipBuffer: Buffer, tags: Tag[]) {
    const jwk = getWallet();
    if (!jwk) throw '[ arweave ] No jwk wallet supplied';

    const arweave = initArweave();

    const dataSize = zipBuffer.length;
    const tx = await arweave.createTransaction({ data: zipBuffer }, jwk);
    for (const tag of tags) tx.addTag(tag.name, tag.value);

    await arweave.transactions.sign(tx, jwk);
    const response = await arweave.transactions.post(tx);

    log(`${response.status} - ${response.statusText}`);

    if (response.status !== 200) {
        // throw error if arweave tx wasn't posted
        throw `[ arweave ] Posting repo to arweave failed.\n\tError: '${
            response.status
        }' - '${
            response.statusText
        }'\n\tCheck if you have plenty $AR to upload ~${Math.ceil(
            dataSize / 1024
        )} KB of data.`;
    }

    return tx.id;
}

export async function turboUpload(zipBuffer: Buffer, tags: Tag[]) {
    const jwk = getWallet();
    if (!jwk) throw '[ turbo ] No jwk wallet supplied';

    // Testing upload with arbundles
    const node = 'https://turbo.ardrive.io';
    const uint8ArrayZip = new Uint8Array(zipBuffer);
    const signer = new ArweaveSigner(jwk);

    const dataItem = createData(uint8ArrayZip, signer, { tags });

    await dataItem.sign(signer);

    const res = await fetch(`${node}/tx`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/octet-stream',
        },
        body: dataItem.getRaw(),
    });

    if (res.status >= 400)
        throw new Error(
            `[ turbo ] Posting repo with turbo failed. Error: ${res.status} - ${res.statusText}`
        );

    return dataItem.id;
}
