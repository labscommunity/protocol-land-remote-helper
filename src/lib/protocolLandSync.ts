import { walletJWK } from '../wallet';
import { getRepo } from './warpHelper';

const getWallet = () => {
    const wallet = process.env.WALLET
        ? JSON.parse(process.env.WALLET)
        : walletJWK;
    if (!wallet) throw new Error('No Wallet provided');
};

export const downloadProtocolLandRepo = async (
    repoId: string,
    destPath: string
) => {
    const wallet = getWallet();
    const repo = getRepo(repoId);
    // if re exists
    //   download repo from arweaveTxId
    //   unzip repo to destPath
    // if repo doesn't exist
    //   git init repo in destPath
    // return
};

export const uploadProtocolLandRepo = async (destPath: string) => {
    const wallet = getWallet();
};
