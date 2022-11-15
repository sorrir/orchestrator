# Generating kubernetes manifest files

## Goal

We want to be able to deploy sorrir-apps using compact config-files with little to no redundancy.

## Using the generator

### Prerequisites

- Node
- kubectl
- Pulumi (`$ curl -sSL https://get.pulumi.com | sh`)

### Inner workings

The generator resides in [index.ts](index.ts).
It is invoked by pulumi and converts a sorrirApp configuration into a kubernetes configuration.
The sorrirApp configuration (exported from the configuration-gui) is expected to reside in [configuration.json](config.json).

### Running the Generator

`pulumi up` for starting and updating , `pulumi destroy` for stopping and deleting all ressources.

In the pulumi programming model, you work in so-called stacks. 
A stack is much like a git repository, but for deployments. 
It provides versioning for deployments and enables rollbacks.
Stacks can by synced via the Pulumi Cloud, but for this an account is needed.

#### First Run

On the first `pulumi up` you will be prompted to log into your Pulumi account.
If you want to use pulumi without an online account, you can run `pulumi login --local` beforehand.

You will also be prompted to choose or create a new stack.
Choose to create one, select an appropriate name (e.g. "dev") and a passphrase.
Further `pulumi up/destroy` operations will operate on this stack.

So, to deploy the configured application via the current stack, simply run:
```
PULUMI_CONFIG_PASSPHRASE="your-passphrase" GENERATOR_CONFIG="configuration.json" pulumi up
```
