import Arweave from "arweave";
import { Tag } from "arweave/node/lib/transaction";
import { ArweaveSigner, createData } from "arbundles";
import { getWallet } from "./common";

const jwk = getWallet();

export async function getAddress() {
  return await initArweave().wallets.jwkToAddress(getWallet());
}

export async function uploadRepo(zipBuffer: Buffer, tags: Tag[]) {
  try {
    // upload compressed repo using bundlr
    const bundlrTxId = await bundlrUpload(zipBuffer, tags);
    console.log("Posted Tx to Bundlr: ", bundlrTxId);
    return bundlrTxId;
  } catch (error) {
    console.log("Error uploading using bundlr, trying with Arweave...");
    // let Arweave throw if it encounters errors
    const arweaveTxId = await arweaveUpload(zipBuffer, tags);
    console.log("Posted Tx to Arweave: ", arweaveTxId);
    return arweaveTxId;
  }
}

function initArweave() {
  return Arweave.init({
    host: "arweave.net",
    port: 443,
    protocol: "https",
  });
}

async function arweaveUpload(zipBuffer: Buffer, tags: Tag[]) {
  if (!jwk) throw "[ arweave ] No jwk wallet supplied";

  const arweave = initArweave();

  const dataSize = zipBuffer.length;
  const tx = await arweave.createTransaction({ data: zipBuffer }, jwk);
  for (const tag of tags) tx.addTag(tag.name, tag.value);

  await arweave.transactions.sign(tx, jwk);
  const response = await arweave.transactions.post(tx);

  console.log(`${response.status} - ${response.statusText}`);

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
  if (!jwk) throw "[ bundlr ] No jwk wallet supplied";

  // Testing upload with arbundles
  const node = "https://node2.bundlr.network";
  const uint8ArrayZip = new Uint8Array(zipBuffer);
  const signer = new ArweaveSigner(getWallet());

  const dataItem = createData(uint8ArrayZip, signer, { tags });

  await dataItem.sign(signer);

  const res = await fetch(`${node}/tx`, {
    method: "POST",
    headers: {
      "Content-Type": "application/octet-stream",
    },
    body: dataItem.getRaw(),
  });

  if (res.status >= 400)
    throw new Error(
      `[ bundlr ] Posting repo w/bundlr faile. Error: ${res.status} - ${res.statusText}`
    );

  return dataItem.id;
}
