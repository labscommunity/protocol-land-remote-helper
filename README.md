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

> [!Note]
> This globally adds the keyfile path for all repositories. If you prefer to use them selectively per repository, omit the `--global` modifier in the `git config` command.

## Setup Threshold Cost for Push consent

> [!Note]
> This functionality is compatible with UNIX-based operating systems such as Linux, macOS etc. For Windows users, leveraging the Windows Subsystem for Linux (WSL) is recommended.

To effectively manage push consent based on the cost of pushing changes, you can configure a Threshold Cost. Use the `git config` command to set this threshold value:

```bash
git config --global --add protocol.land.thresholdCost 0.0003
```

This command sets the global threshold cost for push consent to `0.0003 AR`. When the estimated push cost exceeds this threshold, users will be prompted to consent to the fee before proceeding with the push.

> [!Note]
> This threshold is set globally for all repositories. If you wish to apply different thresholds for specific repositories, use the command without the `--global` modifier within the repository's directory.

### Understanding Push Consent Logic

Here's how it decides when to ask for your consent before uploading:

- **No Set Threshold**: Without the threshold set, you'll only be asked for consent if the upload size exceeds the free subsidy size (For example: Turbo bundler used here allows upto 105KB uploads for free).
- **Over the Threshold**: If the upload cost is more than the threshold, consent is requested only if the upload size is larger than what's freely allowed.
- **Under the Threshold**: For costs below the threshold, consent isn't needed, and uploads proceed automatically.

Adjusting the threshold cost allows users and organizations to maintain control over their expenditure on network fees, ensuring transparency and consent for every push operation that incurs a cost above the specified threshold.

## Usage

Once the package is installed, you'll have access to the `git-remote-proland` command in your `PATH` from any working directory.

This command enables `git` to synchronize with [Protocol Land](https://protocol.land) repositories.

### Clone Repositories

#### Clone a repository using ID

```bash
git clone proland://YOUR_PROTOCOL_LAND_REPO_ID repo-name
```

For example, to clone [Protocol Land's repository](https://protocol.land/#/repository/6ace6247-d267-463d-b5bd-7e50d98c3693), run:

```bash
git clone proland://6ace6247-d267-463d-b5bd-7e50d98c3693 protocol-land
```

#### Clone a repository using username and repository name

```bash
git clone proland://username/repo-name
```

For example, to clone [Protocol Land's repository](https://protocol.land/#/repository/6ace6247-d267-463d-b5bd-7e50d98c3693), run:

```bash
git clone proland://clabstest/protocol-land
```

### Adding a Protocol Land Repository as a Remote

To link any of Protocol Land's repositories as a remote in your Git project, use the following command:

```bash
git remote add origin proland://YOUR_PROTOCOL_LAND_REPO_ID
```

Replace `YOUR_PROTOCOL_LAND_REPO_ID` with the specific ID of the Protocol Land repository you wish to associate with your project. This establishes a connection to the remote repository, allowing you to fetch, pull, and push changes seamlessly.

## Fix Remote Helper Issues

If you're facing problems with the remote helper that is related to corrupted warp cache, try deleting the Warp cache directory shown while running Git commands. After deleting it, run your Git commands again to check if the issues are resolved.

For example, this is the directory where the warp cache is stored. It varies for every user.

![image](https://github.com/labscommunity/protocol-land-remote-helper/assets/11836100/640669bf-f196-4302-a5c2-3d1a95387b90)
