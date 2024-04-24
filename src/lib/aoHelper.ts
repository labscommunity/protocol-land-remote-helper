import type { Tag } from 'arweave/node/lib/transaction';
import { AOS_PROCESS_ID, getWallet, isValidUuid, waitFor } from './common';
import type { Repo, SendMessageArgs } from '../types';
import {
    createDataItemSigner,
    dryrun,
    message,
    result,
} from '@permaweb/aoconnect';

function capitalizeFirstLetter(str: string) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function getTags(payload: { [key: string]: string }): Tag[] {
    return Object.entries(payload).map(
        ([key, value]) => ({ name: capitalizeFirstLetter(key), value } as Tag)
    );
}

export function extractMessage(text: string) {
    // This regex looks for a pattern that starts with a colon (escaping it since it's a special character in regex),
    // followed by any character (.) zero or more times (*) in a non-greedy way (?),
    // until it hits an exclamation mark. We're capturing the content between the colon and the exclamation mark.
    const regex = /:\s*([^:!]+)!/;
    const match = text.match(regex);

    // If a match is found, return the captured group, which is the message.
    // Else, return an empty string or null to indicate no match was found.
    return match ? match[1]!.trim() : text;
}

async function sendMessage({ tags, data }: SendMessageArgs) {
    const args = {
        process: AOS_PROCESS_ID,
        tags,
        signer: createDataItemSigner(getWallet()),
    } as any;

    if (data) args.data = data;

    const messageId = await message(args);

    const { Output } = await result({
        message: messageId,
        process: AOS_PROCESS_ID,
    });

    if (Output?.data?.output) {
        throw new Error(extractMessage(Output?.data?.output));
    }

    return messageId;
}

export async function getRepo(id: string) {
    let Messages = [];
    const fields = JSON.stringify([
        'id',
        'name',
        'description',
        'owner',
        'fork',
        'parent',
        'dataTxId',
        'contributors',
        'githubSync',
        'private',
        'privateStateTxId',
    ]);
    if (isValidUuid(id)) {
        ({ Messages } = await dryrun({
            process: AOS_PROCESS_ID,
            tags: getTags({
                Action: 'Get-Repo',
                Id: id,
                Fields: fields,
            }),
        }));
    } else {
        const [username, repoName] = id.split('/');
        if (!username || !repoName) return;

        ({ Messages } = await dryrun({
            process: AOS_PROCESS_ID,
            tags: getTags({
                Action: 'Get-Repo-By-Name-Username',
                "Repo-Name": repoName,
                Username: username,
                Fields: fields,
            }),
        }));
    }

    if (Messages.length === 0) return undefined;

    return JSON.parse(Messages[0].Data)?.result as Repo;
}

export async function updateRepo(repo: Repo, newDataTxId: string) {
    if (!repo.id || !repo.name || !newDataTxId)
        throw '[ AO ] No id, title or dataTxId to update repo ';

    await waitFor(500);

    await sendMessage({
        tags: getTags({
            Action: 'Update-Repo-TxId',
            Id: repo.id,
            "Data-TxId": newDataTxId,
        }),
    });

    return { id: repo.id };
}
