# OTCGateway deployment parameters

One file per network. Fill every address before deploying; the contract rejects the zero address.

| Key | Launch value |
|---|---|
| `owner` | internal 2-of-3 Safe (same Safe is the arbiter at launch) |
| `pauser` | hot EOA held by engineering on-call (can only pause) |
| `authSigner` | aggregator OTC signing key (`OTC_AUTH_SIGNER_PRIVATE_KEY_EVM`), never the keeper key if you can avoid it |
| `arbiter` | the owner Safe at launch; a separate Safe with an external signer before the liquidity ceiling is raised |
| `treasury` | protocol treasury |
| `disputeDelay` | `259200` (3 days) |

Keep the same values on every chain so the CREATE2 address matches. Token whitelisting happens after deployment
from the owner Safe (`setTokenSupported(token, true)`), one call per supported token per chain.
