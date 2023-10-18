import Arweave from 'arweave';
import { ArweaveSigner, createData } from 'arbundles';
import { getWallet, log } from './common';
import type { Tag } from '../types';
import { withAsync } from './withAsync';
import type { JsonWebKey } from 'crypto';

export async function getAddress(wallet?: JsonWebKey) {
    return await initArweave().wallets.jwkToAddress(
        wallet ? wallet : getWallet()
    );
}

export async function uploadRepo(zipBuffer: Buffer, tags: Tag[]) {
    try {
        // upload compressed repo using bundlr
        const bundlrTxId = await bundlrUpload(zipBuffer, tags);
        log(`Posted Tx to Bundlr: ${bundlrTxId}`);
        return bundlrTxId;
    } catch (error) {
        // dismiss error and try with arweave
        log('Bundlr failed, trying with Arweave...');
        // let Arweave throw if it encounters errors
        const arweaveTxId = await arweaveUpload(zipBuffer, tags);
        log(`Posted Tx to Arweave: ${arweaveTxId}`);
        return arweaveTxId;
    }
}

function initArweave() {
    return Arweave.init({
        host: 'arweave.net',
        port: 443,
        protocol: 'https',
    });
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

export async function bundlrUpload(zipBuffer: Buffer, tags: Tag[]) {
    const jwk = getWallet();
    if (!jwk) throw '[ bundlr ] No jwk wallet supplied';

    // Testing upload with arbundles
    const node = 'https://node2.bundlr.network';
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
            `[ bundlr ] Posting repo w/bundlr failed. Error: ${res.status} - ${res.statusText}`
        );

    return dataItem.id;
}
