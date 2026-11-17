# Security Policy

Paycrest's contracts hold and route user funds, so we take security reports seriously and appreciate researchers who disclose responsibly.

## Reporting a vulnerability

**Please do not open a public issue, PR, or discussion for security bugs, and do not share details on social media, Telegram, Discord, or other public channels.**

Report privately through GitHub:

1. Go to [Report a vulnerability](https://github.com/paycrest/contracts/security/advisories/new) (Security tab → Advisories → Report a vulnerability).
2. Include:
   - The affected contract(s), function(s), and commit or deployed address/chain
   - A clear description of the issue and its impact (e.g. loss of funds, frozen funds, unauthorized settlement or refund)
   - A minimal proof of concept, ideally a Foundry test, and steps to reproduce
   - Any suggested fix

If you can't use GitHub, email **[engineering@paycrest.io](mailto:engineering@paycrest.io)**.

## Scope

In scope:
- Contracts in `contracts/` on the `main` branch, especially `Gateway.sol` and its settings/upgrade logic
- Deployed Gateway proxies and implementations listed in `deployments/` and `.openzeppelin/`

Out of scope:
- Issues that need a compromised admin, aggregator, or multisig key
- Known issues already listed in audit reports or open advisories
- Gas optimizations, style, and best-practice suggestions with no security impact
- Third-party contracts and dependencies (report those upstream), unless Paycrest's use of them is what makes them exploitable
- Front-end, API, and off-chain services (report those to [engineering@paycrest.io](mailto:engineering@paycrest.io))

## What to expect

- **Acknowledgement** within 2 business days
- **Initial assessment** (validity and severity) within 5 business days
- Regular updates until the issue is fixed, and credit in the advisory if you'd like it

We assess severity by impact and likelihood, roughly following the [Immunefi severity classification](https://immunefi.com/immunefi-vulnerability-severity-classification-system-v2-3/).

## Rewards

We may offer rewards for valid, previously unreported vulnerabilities. Rewards are discretionary and based on severity and impact; there are no fixed amounts. Reports that break the safe-harbor rules below, or that come with demands for payment before disclosure, are not eligible.

## Safe harbor

We won't pursue legal action against good-faith research that:
- Stays within the scope above
- Uses only local forks or testnets, never live funds or mainnet exploitation
- Avoids privacy violations and service disruption
- Gives us reasonable time to fix the issue before any public disclosure

## Supported versions

Only the latest deployed Gateway implementation on each supported chain and the current `main` branch receive security fixes.
