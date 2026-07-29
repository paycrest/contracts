# Gateway implementation addresses (settleIn rebate)

Deployed via Hardhat Ignition (`ignition/modules/Gateway.ts`) on 2026-07-28.

Upgraded via `npx hardhat upgrade-all-evm` (`USE_EXISTING_IMPL=1`) on 2026-07-29.

Signer: `NEW_OWNER` (`0x285d6CBc1D7674ccEeC6C214Fed2fCbcd4b5ffaD`).

| Network | Chain ID | Implementation | Proxy | Upgrade tx |
|---------|----------|----------------|-------|------------|
| Ethereum | 1 | `0x18f209a96682662b58A7764e18a45d2413AEDE6A` | `0x8d2C0D398832b814e3814802FF2dC8b8eF4381e5` | `0x89216dfcdda864993e8bb481146450bbfc600f4279217b2d78840f1913cbb179` |
| BSC | 56 | `0xe606919d10031A44A4ac3108815512E87d938EbF` | `0x1FA0EE7F9410F6fa49B7AD5Da72Cf01647090028` | `0xfa51c14d00ee452c34e62ca2de33c5c0ecf5d247bd53c2ff3c897840ec5b6f01` |
| Polygon | 137 | `0x2F2EfBe73F7C0287337F2F9D0dBa5ABC24414A21` | `0xfB411Cc6385Af50A562aFCb441864E9d541CDA67` | `0xcc71458ea3309d7e40ae7f2a0743bdd59f6399374848daac869150127d5d67df` |
| Arbitrum | 42161 | `0x2F2EfBe73F7C0287337F2F9D0dBa5ABC24414A21` | `0xE8bc3B607CfE68F47000E3d200310D49041148Fc` | `0xdf8e7afca635d4133bab2c58847bba8b531940d2b6f728f98885327d88c20599` |
| Base | 8453 | `0x2F2EfBe73F7C0287337F2F9D0dBa5ABC24414A21` | `0x30F6A8457F8E42371E204a9c103f2Bd42341dD0F` | `0xf092c421520d94b541fad4430628ee293bed3750edf97506d397890087b81ef2` |
| Celo | 42220 | `0x18f209a96682662b58A7764e18a45d2413AEDE6A` | `0xF418217E3f81092eF44b81C5C8336e6A6fDB0E4b` | `0x85f1d1694f7c6413a56cdbfeb877d03c8ca8e6d9134c1c326d8712d57f701aca` |
| Lisk | 1135 | `0x18f209a96682662b58A7764e18a45d2413AEDE6A` | `0xff0E00E0110C1FBb5315D276243497b66D3a4d8a` | `0xaba0df71eff7235ba9d01cf8dddf37de2c4f0ceafa652002433cb56cdb41e6c9` |

## Verification (2026-07-29)

| Network | Implementation | Explorer | Status |
|---------|----------------|----------|--------|
| Ethereum | `0x18f209…AEDE6A` | [Etherscan](https://etherscan.io/address/0x18f209a96682662b58A7764e18a45d2413AEDE6A#code) | ✅ verified |
| BSC | `0xe60691…938EbF` | [BscScan](https://bscscan.com/address/0xe606919d10031A44A4ac3108815512E87d938EbF#code) | ✅ verified (+ Sourcify) |
| Polygon | `0x2F2EfB…414A21` | [PolygonScan](https://polygonscan.com/address/0x2F2EfBe73F7C0287337F2F9D0dBa5ABC24414A21#code) | ✅ verified |
| Arbitrum | `0x2F2EfB…414A21` | [Arbiscan](https://arbiscan.io/address/0x2F2EfBe73F7C0287337F2F9D0dBa5ABC24414A21#code) | ✅ verified |
| Base | `0x2F2EfB…414A21` | [Basescan](https://basescan.org/address/0x2F2EfBe73F7C0287337F2F9D0dBa5ABC24414A21#code) | ✅ already verified |
| Celo | `0x18f209…AEDE6A` | [Celoscan](https://celoscan.io/address/0x18f209a96682662b58A7764e18a45d2413AEDE6A#code) | ✅ already verified |
| Lisk | `0x18f209…AEDE6A` | [Sourcify](https://sourcify.dev/server/repo-ui/1135/0x18f209a96682662b58A7764e18a45d2413AEDE6A) | ⚠️ Sourcify only (Lisk explorer API error) |

## Not included

| Network | Reason |
|---------|--------|
| Scroll | Insufficient balance (not upgraded) |
