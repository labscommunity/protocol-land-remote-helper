# Git Remote Proland

A basic git-remote-helper for Protocol Land remotes

## Requirements

- `git`
- `node`
- `npm`, `yarn` or `pnpm`

This is a tool to allow `git` to communicate and sync [Protocol Land](https://protocol.land) repos.

You need `node` installed in your system. We recommend using `nvm`, a powerful node version manager.

Once you have `node` running in your system, please install a node package manager such as `npm`, `yarn` or `pnpm`.

## Installation

### Using `npm`

```bash
npm install --global @7i7o/git-remote-proland
```

### Using `yarn`

```bash
yarn add --global @7i7o/git-remote-proland
```

### Using `pnpm`

```bash
pnpm add --global @7i7o/git-remote-proland
```

## Setup Arweave Wallet keyfile

For `git push` or write access to repos, you need an Arweave wallet keyfile.

Asumming you have your Arweave wallet keyfile stored in `~/private_folder/jwk_keyfile.json`, you can set up your keyfile path using `git config`:

```bash
git config --global --add protocol.land.keyfile ~/private_folder/jwk_keyfile.json
```

> NOTE: This adds the keyfile path globally for all repos. If you want to use them discretionally per repo, you can remove the `--global` modifier in the `git config` command.

## Usage

Once the package is installed you'll have a command `git-remote-proland` available in your `PATH` to be run from any folder you are working on.

This allows `git` to sync to [Protocol Land](https://protocol.land) repos.

### Clone repos

```bash
git clone proland://YOUR_PROTOCOL_LAND_REPO_ID repo-name
```

For example, if you want to clone an [example repo](https://protocol-land-git-development-community-labs.vercel.app/#/repository/ca6a9b1a-3e77-4158-9707-e079cbf1fdeb) from protocol land, you can run:

```bash
git clone proland://ca6a9b1a-3e77-4158-9707-e079cbf1fdeb playground
```
