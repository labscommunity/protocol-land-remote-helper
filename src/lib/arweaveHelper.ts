import { ArweaveSigner, bundleAndSignData, createData } from 'arbundles';
import readline from 'node:readline';
import fs, { promises as fsPromises } from 'fs';
import { getThresholdCost, getWallet, initArweave, log } from './common';
import type { SubsidizedUploadJsonResponse, Tag } from '../types';
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

async function getTurboSubsidy() {
    const defaultSubsidy = 107520;
    try {
        const response = await fetch('https://turbo.ardrive.io/');
        if (!response.ok) return defaultSubsidy;

        const data = (await response.json()) as {
            freeUploadLimitBytes: number;
        };
        return +data.freeUploadLimitBytes ?? defaultSubsidy;
    } catch (err) {}
    return defaultSubsidy;
}

export async function uploadRepo(
    zipBuffer: Buffer,
    tags: Tag[],
    uploadSize: number,
    uploadCost: number
) {
    //Subsidized Upload
    try {
        const uploadedTx = await subsidizedUpload(zipBuffer, tags);
        const serviceUsed = uploadedTx.bundled ? 'Turbo' : 'Arweave';

        log(`Posted Tx to ${serviceUsed}: ${uploadedTx.data.repoTxId}`);
        return { txId: uploadedTx.data.repoTxId, pushCancelled: false };
    } catch (error) {
        const userWantsToPay = await shouldUserPayForTx();

        if (!userWantsToPay) {
            return { txid: '', pushCancelled: true };
        }
        //continue
    }

    // 105KB subsidySize for TurboUpload and 0 subsidySize for ArweaveUpload
    const turboSubsidySize = await getTurboSubsidy();
    const subsidySize = Math.max(turboSubsidySize, 0);
    const pushChanges = await shouldPushChanges(
        uploadSize,
        uploadCost,
        subsidySize
    );

    async function attemptUpload(
        uploaderName: string,
        uploader: (buffer: Buffer, tags: Tag[]) => Promise<string>
    ) {
        if (pushChanges) {
            const txId = await uploader(zipBuffer, tags);
            log(`Posted Tx to ${uploaderName}: ${txId}`);
            return { txId, pushCancelled: false };
        }
        return { txid: '', pushCancelled: true };
    }

    try {
        return await attemptUpload('Turbo', turboUpload);
    } catch (error) {
        log('Turbo failed, trying with Arweave...');
        return await attemptUpload('Arweave', arweaveUpload);
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

export async function subsidizedUpload(zipBuffer: Buffer, tags: Tag[]) {
    const jwk = getWallet();
    if (!jwk) throw '[ turbo ] No jwk wallet supplied';

    const node = 'https://subsidize.saikranthi.dev/api/v1/postrepo';
    const uint8ArrayZip = new Uint8Array(zipBuffer);
    const signer = new ArweaveSigner(jwk);
    const address = await getAddress(jwk);

    const dataItem = createData(uint8ArrayZip, signer, { tags });
    await dataItem.sign(signer);

    const bundle = await bundleAndSignData([dataItem], signer);

    const res = await fetch(`${node}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
        },
        body: JSON.stringify({
            txBundle: bundle.getRaw(),
            platform: 'CLI',
            owner: address,
        }),
    });
    const upload = (await res.json()) as SubsidizedUploadJsonResponse;

    if (!upload || !upload.success)
        throw new Error(
            `[ turbo ] Posting repo with turbo failed. Error: ${res.status} - ${res.statusText}`
        );

    return upload;
}

async function shouldUserPayForTx() {
    log('[ PL SUBSIDIZE ] Failed to subsidize this transaction.');

    try {
        const answer = await askQuestionThroughTty(
            ' [PL] Would you like to pay for this transaction yourself? (y/n): '
        );
        return answer === 'yes' || answer === 'y';
    } catch (err) {
        return true;
    }
}
