import Arweave from 'arweave';
import crypto from 'crypto';
import type { PrivateState, Repo } from '../types';
import { getActivePublicKey, getAddress } from './arweaveHelper';
import { log } from './common';
import {
    decryptAesKeyWithPrivateKey,
    decryptFileWithAesGcm,
} from './privateRepo';

export async function deriveAddress(publicKey: string) {
    const arweave = Arweave.init({
        host: 'ar-io.net',
        port: 443,
        protocol: 'https',
    });

    const pubKeyBuf = arweave.utils.b64UrlToBuffer(publicKey);
    const sha512DigestBuf = await crypto.subtle.digest('SHA-512', pubKeyBuf);

    return arweave.utils.bufferTob64Url(new Uint8Array(sha512DigestBuf));
}

async function decryptPAT(
    encryptedPATString: string,
    privateStateTxId: string
): Promise<string> {
    const arweave = new Arweave({
        host: 'ar-io.net',
        port: 443,
        protocol: 'https',
    });

    const encryptedPAT = arweave.utils.b64UrlToBuffer(encryptedPATString);
    const response = await fetch(`https://arweave.net/${privateStateTxId}`);
    const privateState = (await response.json()) as PrivateState;
    const ivArrBuff = arweave.utils.b64UrlToBuffer(privateState.iv);

    //public key -> hash -> get the aes key from object
    const pubKey = await getActivePublicKey();
    const address = await deriveAddress(pubKey);

    const encAesKeyStr = privateState.encKeys[address];
    const encAesKeyBuf = arweave.utils.b64UrlToBuffer(encAesKeyStr!);

    const aesKey = (await decryptAesKeyWithPrivateKey(
        encAesKeyBuf
    )) as unknown as ArrayBuffer;
    const accessToken = await decryptFileWithAesGcm(
        encryptedPAT,
        aesKey,
        ivArrBuff
    );

    return new TextDecoder().decode(accessToken);
}

export async function triggerGithubSync(repo: Repo) {
    try {
        if (!repo) return;

        const githubSync = repo.githubSync;
        if (!githubSync || !githubSync?.enabled) return;

        const connectedAddress = await getAddress();
        const isAllowed = githubSync?.allowed?.includes(connectedAddress);

        if (
            !isAllowed ||
            !githubSync.repository ||
            !githubSync.workflowId ||
            !githubSync.branch ||
            !githubSync.accessToken ||
            !githubSync.privateStateTxId
        ) {
            return;
        }

        const accessToken = await decryptPAT(
            githubSync.accessToken,
            githubSync.privateStateTxId
        );

        if (!accessToken) return;

        const response = await fetch(
            `https://api.github.com/repos/${githubSync?.repository}/actions/workflows/${githubSync?.workflowId}/dispatches`,
            {
                method: 'POST',
                headers: {
                    Accept: 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                    Authorization: `Bearer ${accessToken}`,
                },
                body: JSON.stringify({
                    ref: githubSync?.branch,
                    inputs: { repoId: repo.id },
                }),
            }
        );

        if (response.status === 204) {
            log('Successfully triggered GitHub Sync');
        }
    } catch (err) {
        //
    }
}
