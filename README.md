# Protocol Land Git Remote Helper

The Protocol Land Git Remote Helper is a git-remote-helper designed to facilitate communication and synchronization with [Protocol Land](https://protocol.land/) repositories.

## Requirements

Ensure the following dependencies are installed on your system:

- `git`
- `node`
- Choose one of the following package managers: `npm`, `yarn`, or `pnpm`

To manage your Node.js installation, we recommend using `nvm`, a robust node version manager.

## Installation

### Using `npm`

```bash
npm install --global @protocol.land/git-remote-helper
```

### Using `yarn`

```bash
yarn global add @protocol.land/git-remote-helper
```

### Using `pnpm`

```bash
pnpm add --global @protocol.land/git-remote-helper
```

## Setup Arweave Wallet Keyfile

To enable `git push` or gain write access to repositories, you'll need an Arweave wallet keyfile. Assuming your Arweave wallet keyfile is stored at `~/private_folder/jwk_keyfile.json`, configure the keyfile path using `git config`:

```bash
git config --global --add protocol.land.keyfile ~/private_folder/jwk_keyfile.json
```

> **Note:** This globally adds the keyfile path for all repositories. If you prefer to use them selectively per repository, omit the `--global` modifier in the `git config` command.

## Usage

Once the package is installed, you'll have access to the `git-remote-proland` command in your `PATH` from any working directory.

This command enables `git` to synchronize with [Protocol Land](https://protocol.land) repositories.

### Clone Repositories

Clone a repository using the following command:

```bash
git clone proland://YOUR_PROTOCOL_LAND_REPO_ID repo-name
```

For example, to clone [Protocol Land's repository](https://protocol.land/#/repository/6ace6247-d267-463d-b5bd-7e50d98c3693), run:

```bash
git clone proland://6ace6247-d267-463d-b5bd-7e50d98c3693 protocol-land
```

### Adding a Protocol Land Repository as a Remote

To link any of Protocol Land's repositories as a remote in your Git project, use the following command:

```bash
git remote add origin proland://YOUR_PROTOCOL_LAND_REPO_ID
```

Replace `YOUR_PROTOCOL_LAND_REPO_ID` with the specific ID of the Protocol Land repository you wish to associate with your project. This establishes a connection to the remote repository, allowing you to fetch, pull, and push changes seamlessly.