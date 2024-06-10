import type * as types from './types';
import type { ConfigOptions, FetchResponse } from 'api/dist/core'
import Oas from 'oas';
import APICore from 'api/dist/core';
import definition from './openapi.json';

class SDK {
  spec: Oas;
  core: APICore;

  constructor() {
    this.spec = Oas.init(definition);
    this.core = new APICore(this.spec, 'tron/unknown (api/6.1.1)');
  }

  /**
   * Optionally configure various options that the SDK allows.
   *
   * @param config Object of supported SDK options and toggles.
   * @param config.timeout Override the default `fetch` request timeout of 30 seconds. This number
   * should be represented in milliseconds.
   */
  config(config: ConfigOptions) {
    this.core.setConfig(config);
  }

  /**
   * If the API you're using requires authentication you can supply the required credentials
   * through this method and the library will magically determine how they should be used
   * within your API request.
   *
   * With the exception of OpenID and MutualTLS, it supports all forms of authentication
   * supported by the OpenAPI specification.
   *
   * @example <caption>HTTP Basic auth</caption>
   * sdk.auth('username', 'password');
   *
   * @example <caption>Bearer tokens (HTTP or OAuth 2)</caption>
   * sdk.auth('myBearerToken');
   *
   * @example <caption>API Keys</caption>
   * sdk.auth('myApiKey');
   *
   * @see {@link https://spec.openapis.org/oas/v3.0.3#fixed-fields-22}
   * @see {@link https://spec.openapis.org/oas/v3.1.0#fixed-fields-22}
   * @param values Your auth credentials for the API; can specify up to two strings or numbers.
   */
  auth(...values: string[] | number[]) {
    this.core.setAuth(...values);
    return this;
  }

  /**
   * If the API you're using offers alternate server URLs, and server variables, you can tell
   * the SDK which one to use with this method. To use it you can supply either one of the
   * server URLs that are contained within the OpenAPI definition (along with any server
   * variables), or you can pass it a fully qualified URL to use (that may or may not exist
   * within the OpenAPI definition).
   *
   * @example <caption>Server URL with server variables</caption>
   * sdk.server('https://{region}.api.example.com/{basePath}', {
   *   name: 'eu',
   *   basePath: 'v14',
   * });
   *
   * @example <caption>Fully qualified server URL</caption>
   * sdk.server('https://eu.api.example.com/v14');
   *
   * @param url Server URL
   * @param variables An object of variables to replace into the server URL.
   */
  server(url: string, variables = {}) {
    this.core.setServer(url, variables);
  }

  /**
   * Query the latest block information
   *
   * @summary GetNowBlock
   */
  walletGetnowblock(): Promise<FetchResponse<200, types.WalletGetnowblockResponse200>> {
    return this.core.fetch('/wallet/getnowblock', 'post');
  }

  /**
   * Create a TRX transfer transaction. If to_address does not exist, then create the account
   * on the blockchain.
   *
   * @summary CreateTransaction
   * @throws FetchError<400, types.CreatetransactionResponse400> 400
   */
  createtransaction(body?: types.CreatetransactionBodyParam): Promise<FetchResponse<200, types.CreatetransactionResponse200>> {
    return this.core.fetch('/wallet/createtransaction', 'post', body);
  }

  /**
   * Returns the Block Object corresponding to the 'Block Height' specified (number of blocks
   * preceding it).
   *
   * @summary GetBlockByNum
   */
  walletGetblockbynum(body?: types.WalletGetblockbynumBodyParam): Promise<FetchResponse<200, types.WalletGetblockbynumResponse200>> {
    return this.core.fetch('/wallet/getblockbynum', 'post', body);
  }

  /**
   * This interface has been deprecated.
   *
   * @summary EasyTransfer
   * @throws FetchError<400, types.EasytransferResponse400> 400
   */
  easytransfer(body: types.EasytransferBodyParam): Promise<FetchResponse<200, types.EasytransferResponse200>> {
    return this.core.fetch('/wallet/easytransfer', 'post', body);
  }

  /**
   * Modify account name
   *
   * @summary UpdateAccount
   * @throws FetchError<400, types.UpdateaccountResponse400> 400
   */
  updateaccount(body?: types.UpdateaccountBodyParam): Promise<FetchResponse<200, types.UpdateaccountResponse200>> {
    return this.core.fetch('/wallet/updateaccount', 'post', body);
  }

  /**
   * Generate a random private key and address. This API has been deprecated, please generate
   * address offline.
   *
   * @summary GenerateAddress
   * @throws FetchError<400, types.GenerateaddressResponse400> 400
   */
  generateaddress(): Promise<FetchResponse<200, types.GenerateaddressResponse200>> {
    return this.core.fetch('/wallet/generateaddress', 'get');
  }

  /**
   * Creates an address from the specified password string (not the private key).This
   * interface has been deprecated, please generate address offline.
   *
   * @summary CreateAddress
   * @throws FetchError<400, types.CreateaddressResponse400> 400
   */
  createaddress(body: types.CreateaddressBodyParam): Promise<FetchResponse<200, types.CreateaddressResponse200>> {
    return this.core.fetch('/wallet/createaddress', 'post', body);
  }

  /**
   * List all Super Representatives.
   *
   * @summary ListWitnesses
   */
  listwitnesses(): Promise<FetchResponse<number, unknown>> {
    return this.core.fetch('/wallet/listwitnesses', 'get');
  }

  /**
   * Update basic TRC10 token information.
   *
   * @summary UpdateAsset
   * @throws FetchError<400, types.WalletUpdateassetResponse400> 400
   */
  walletUpdateasset(body?: types.WalletUpdateassetBodyParam): Promise<FetchResponse<200, types.WalletUpdateassetResponse200>> {
    return this.core.fetch('/wallet/updateasset', 'post', body);
  }

  /**
   * Query the TRC10 token information issued by an account.
   *
   * @summary GetAssetIssueByAccount
   */
  getassetissuebyaccount(body?: types.GetassetissuebyaccountBodyParam): Promise<FetchResponse<number, unknown>> {
    return this.core.fetch('/wallet/getassetissuebyaccount', 'post', body);
  }

  /**
   * Query bandwidth information.
   *
   * @summary GetAccountNet
   */
  getaccountnet(body?: types.GetaccountnetBodyParam): Promise<FetchResponse<200, types.GetaccountnetResponse200>> {
    return this.core.fetch('/wallet/getaccountnet', 'post', body);
  }

  /**
   * Query the list of nodes connected to the API node
   *
   * @summary ListNodes
   * @throws FetchError<400, types.WalletListnodesResponse400> 400
   */
  walletListnodes(): Promise<FetchResponse<200, types.WalletListnodesResponse200>> {
    return this.core.fetch('/wallet/listnodes', 'get');
  }

  /**
   * Query block by ID(block hash).
   *
   * @summary GetBlockById
   */
  getblockbyid(body?: types.GetblockbyidBodyParam): Promise<FetchResponse<200, types.GetblockbyidResponse200>> {
    return this.core.fetch('/wallet/getblockbyid', 'post', body);
  }

  /**
   * Query a token by token id. Returns the token object, which contains the token name.
   *
   * @summary GetAssetIssueById
   */
  getassetissuebyid(body?: types.GetassetissuebyidBodyParam): Promise<FetchResponse<number, unknown>> {
    return this.core.fetch('/wallet/getassetissuebyid', 'post', body);
  }

  /**
   * Query transaction information by transaction id.
   *
   * @summary GetTransactionById
   */
  walletGettransactionbyid(body?: types.WalletGettransactionbyidBodyParam): Promise<FetchResponse<200, types.WalletGettransactionbyidResponse200>> {
    return this.core.fetch('/wallet/gettransactionbyid', 'post', body);
  }

  /**
   * Query the list of all the TRC10 tokens.
   *
   * @summary GetAssetIssueList
   */
  getassetissuelist(): Promise<FetchResponse<number, unknown>> {
    return this.core.fetch('/wallet/getassetissuelist', 'get');
  }

  /**
   * Returns the list of Block Objects included in the 'Block Height' range specified.
   *
   * @summary GetBlockByLimitNext
   * @throws FetchError<400, types.GetblockbylimitnextResponse400> 400
   */
  getblockbylimitnext(body?: types.GetblockbylimitnextBodyParam): Promise<FetchResponse<200, types.GetblockbylimitnextResponse200>> {
    return this.core.fetch('/wallet/getblockbylimitnext', 'post', body);
  }

  /**
   * Returns a list of block objects.
   *
   * @summary GetBlockByLatestNum
   * @throws FetchError<400, types.WalletGetblockbylatestnumResponse400> 400
   */
  walletGetblockbylatestnum(body?: types.WalletGetblockbylatestnumBodyParam): Promise<FetchResponse<200, types.WalletGetblockbylatestnumResponse200>> {
    return this.core.fetch('/wallet/getblockbylatestnum', 'post', body);
  }

  /**
   * Returns the timestamp of the next voting time in milliseconds.
   *
   * @summary GetNextMaintenanceTime
   * @throws FetchError<400, types.GetnextmaintenancetimeResponse400> 400
   */
  getnextmaintenancetime(): Promise<FetchResponse<200, types.GetnextmaintenancetimeResponse200>> {
    return this.core.fetch('/wallet/getnextmaintenancetime', 'get');
  }

  /**
   * Injects capital into the transaction. The purpose of injecting capital into the trading
   * pair is to prevent price fluctuation from affecting the transaction.
   *
   * @summary ExchangeInject
   * @throws FetchError<400, types.ExchangeinjectResponse400> 400
   */
  exchangeinject(body?: types.ExchangeinjectBodyParam): Promise<FetchResponse<200, types.ExchangeinjectResponse200>> {
    return this.core.fetch('/wallet/exchangeinject', 'post', body);
  }

  /**
   * Validates address, returns either true or false.
   *
   * @summary ValidateAddress
   * @throws FetchError<400, types.ValidateaddressResponse400> 400
   */
  validateaddress(body: types.ValidateaddressBodyParam): Promise<FetchResponse<200, types.ValidateaddressResponse200>> {
    return this.core.fetch('/wallet/validateaddress', 'post', body);
  }

  /**
   * Query the list of all the tokens by pagination.Returns a list of Tokens that succeed the
   * Token located at offset.
   *
   * @summary GetPaginatedAssetIssueList
   */
  getpaginatedassetissuelist(body?: types.GetpaginatedassetissuelistBodyParam): Promise<FetchResponse<number, unknown>> {
    return this.core.fetch('/wallet/getpaginatedassetissuelist', 'post', body);
  }

  /**
   * Withdraws the transaction pair.
   *
   * @summary ExchangeWithdraw
   * @throws FetchError<400, types.ExchangewithdrawResponse400> 400
   */
  exchangewithdraw(body?: types.ExchangewithdrawBodyParam): Promise<FetchResponse<200, types.ExchangewithdrawResponse200>> {
    return this.core.fetch('/wallet/exchangewithdraw', 'post', body);
  }

  /**
   * Query exchange pair based on id
   *
   * @summary GetExchangeById
   * @throws FetchError<400, types.WalletGetexchangebyidResponse400> 400
   */
  walletGetexchangebyid(body?: types.WalletGetexchangebyidBodyParam): Promise<FetchResponse<200, types.WalletGetexchangebyidResponse200>> {
    return this.core.fetch('/wallet/getexchangebyid', 'post', body);
  }

  /**
   * Participate the transaction of exchange pair
   *
   * @summary ExchangeTransaction
   * @throws FetchError<400, types.ExchangetransactionResponse400> 400
   */
  exchangetransaction(body?: types.ExchangetransactionBodyParam): Promise<FetchResponse<200, types.ExchangetransactionResponse200>> {
    return this.core.fetch('/wallet/exchangetransaction', 'post', body);
  }

  /**
   * List all exchange pairs.
   *
   * @summary ListExchanges
   * @throws FetchError<400, types.WalletListexchangesResponse400> 400
   */
  walletListexchanges(metadata?: types.WalletListexchangesMetadataParam): Promise<FetchResponse<200, types.WalletListexchangesResponse200>> {
    return this.core.fetch('/wallet/listexchanges', 'get', metadata);
  }

  /**
   * Creates a proposal transaction.
   *
   * @summary ProposalCreate
   * @throws FetchError<400, types.ProposalcreateResponse400> 400
   */
  proposalcreate(body?: types.ProposalcreateBodyParam): Promise<FetchResponse<200, types.ProposalcreateResponse200>> {
    return this.core.fetch('/wallet/proposalcreate', 'post', body);
  }

  /**
   * Queries proposal based on ID and returns proposal details.
   *
   * @summary GetProposalById
   * @throws FetchError<400, types.GetproposalbyidResponse400> 400
   */
  getproposalbyid(body?: types.GetproposalbyidBodyParam): Promise<FetchResponse<200, types.GetproposalbyidResponse200>> {
    return this.core.fetch('/wallet/getproposalbyid', 'post', body);
  }

  /**
   * List all proposals.
   *
   * @summary ListProposals
   * @throws FetchError<400, types.WalletListproposalsResponse400> 400
   */
  walletListproposals(): Promise<FetchResponse<200, types.WalletListproposalsResponse200>> {
    return this.core.fetch('/wallet/listproposals', 'get');
  }

  /**
   * Approves proposed transaction.
   *
   * @summary ProposalApprove
   * @throws FetchError<400, types.ProposalapproveResponse400> 400
   */
  proposalapprove(body?: types.ProposalapproveBodyParam): Promise<FetchResponse<200, types.ProposalapproveResponse200>> {
    return this.core.fetch('/wallet/proposalapprove', 'post', body);
  }

  /**
   * Deletes Proposal Transaction.
   *
   * @summary ProposalDelete
   * @throws FetchError<400, types.ProposaldeleteResponse400> 400
   */
  proposaldelete(body?: types.ProposaldeleteBodyParam): Promise<FetchResponse<200, types.ProposaldeleteResponse200>> {
    return this.core.fetch('/wallet/proposaldelete', 'post', body);
  }

  /**
   * Query information about an account, including TRX balance, TRC-10 balances, stake
   * information and vote information and permissions etc.
   *
   * @summary GetAccount
   * @throws FetchError<400, types.AccountGetaccountResponse400> 400
   */
  accountGetaccount(body?: types.AccountGetaccountBodyParam): Promise<FetchResponse<200, types.AccountGetaccountResponse200>> {
    return this.core.fetch('/wallet/getaccount', 'post', body);
  }

  /**
   * Sign the transaction, it is recommended to sign transactions offline.
   *
   * @summary GetTransactionSign
   * @throws FetchError<400, types.GettransactionsignResponse400> 400
   */
  gettransactionsign(body: types.GettransactionsignBodyParam): Promise<FetchResponse<200, types.GettransactionsignResponse200>> {
    return this.core.fetch('/wallet/gettransactionsign', 'post', body);
  }

  /**
   * Broadcast the signed transaction
   *
   * @summary BroadcastTransaction
   */
  broadcasttransaction(body: types.BroadcasttransactionBodyParam): Promise<FetchResponse<200, types.BroadcasttransactionResponse200>> {
    return this.core.fetch('/wallet/broadcasttransaction', 'post', body);
  }

  /**
   * Apply to become a witness.
   *
   * @summary CreateWitness
   * @throws FetchError<400, types.CreatewitnessResponse400> 400
   */
  createwitness(body?: types.CreatewitnessBodyParam): Promise<FetchResponse<200, types.CreatewitnessResponse200>> {
    return this.core.fetch('/wallet/createwitness', 'post', body);
  }

  /**
   * Vote for witnesses
   *
   * @summary VoteWitnessAccount
   * @throws FetchError<400, types.VotewitnessaccountResponse400> 400
   */
  votewitnessaccount(body?: types.VotewitnessaccountBodyParam): Promise<FetchResponse<200, types.VotewitnessaccountResponse200>> {
    return this.core.fetch('/wallet/votewitnessaccount', 'post', body);
  }

  /**
   * Activate an account. Uses an already activated account to activate a new account. Users
   * have to generate an account locally with wallet-cli or others SDKs like TronWeb, and
   * then use this API to activate the account generated, or just simply transfer TRX to it.
   *
   * @summary CreateAccount
   * @throws FetchError<400, types.AccountCreateaccountResponse400> 400
   */
  accountCreateaccount(body?: types.AccountCreateaccountBodyParam): Promise<FetchResponse<200, types.AccountCreateaccountResponse200>> {
    return this.core.fetch('/wallet/createaccount', 'post', body);
  }

  /**
   * Transfer TRC10 token.
   *
   * @summary TransferAsset
   * @throws FetchError<400, types.TransferassetResponse400> 400
   */
  transferasset(body?: types.TransferassetBodyParam): Promise<FetchResponse<200, types.TransferassetResponse200>> {
    return this.core.fetch('/wallet/transferasset', 'post', body);
  }

  /**
   * Participate in an asset issue.
   *
   * @summary ParticipateAssetIssue
   * @throws FetchError<400, types.ParticipateassetissueResponse400> 400
   */
  participateassetissue(body?: types.ParticipateassetissueBodyParam): Promise<FetchResponse<200, types.ParticipateassetissueResponse200>> {
    return this.core.fetch('/wallet/participateassetissue', 'post', body);
  }

  /**
   * Issue a TRC10 token.
   *
   * @summary CreateAssetIssue
   */
  createassetissue(body?: types.CreateassetissueBodyParam): Promise<FetchResponse<number, unknown>> {
    return this.core.fetch('/wallet/createassetissue', 'post', body);
  }

  /**
   * This interface has been deprecated, please use
   * [FreezeBalanceV2](/reference/freezebalancev2-1) to stake TRX to obtain resources.
   *
   * @summary FreezeBalance
   * @throws FetchError<400, types.AccountResourcesFreezebalanceResponse400> 400
   */
  accountResourcesFreezebalance(body?: types.AccountResourcesFreezebalanceBodyParam): Promise<FetchResponse<200, types.AccountResourcesFreezebalanceResponse200>> {
    return this.core.fetch('/wallet/freezebalance', 'post', body);
  }

  /**
   * Unstake the TRX staked during Stake1.0, release the obtained bandwidth or energy and TP.
   * This operation will cause automatically cancel all votes.
   *
   * @summary UnfreezeBalance
   * @throws FetchError<400, types.AccountResourcesUnfreezebalanceResponse400> 400
   */
  accountResourcesUnfreezebalance(body?: types.AccountResourcesUnfreezebalanceBodyParam): Promise<FetchResponse<200, types.AccountResourcesUnfreezebalanceResponse200>> {
    return this.core.fetch('/wallet/unfreezebalance', 'post', body);
  }

  /**
   * Unstake a token that has passed the minimum freeze duration.
   *
   * @summary UnfreezeAsset
   * @throws FetchError<400, types.UnfreezeassetResponse400> 400
   */
  unfreezeasset(body?: types.UnfreezeassetBodyParam): Promise<FetchResponse<200, types.UnfreezeassetResponse200>> {
    return this.core.fetch('/wallet/unfreezeasset', 'post', body);
  }

  /**
   * Deploys a contract. Returns TransactionExtention, which contains an unsigned
   * transaction.
   *
   * @summary DeployContract
   * @throws FetchError<400, types.WalletDeploycontractResponse400> 400
   */
  walletDeploycontract(body?: types.WalletDeploycontractBodyParam): Promise<FetchResponse<200, types.WalletDeploycontractResponse200>> {
    return this.core.fetch('/wallet/deploycontract', 'post', body);
  }

  /**
   * Super Representative or user withdraw rewards, usable every 24 hours.
   * Super representatives can withdraw the balance from the account allowance into the
   * account balance,
   * Users can claim the voting reward from the SRs and deposit into his account balance.
   *
   * @summary WithdrawBalance
   * @throws FetchError<400, types.WithdrawbalanceResponse400> 400
   */
  withdrawbalance(body?: types.WithdrawbalanceBodyParam): Promise<FetchResponse<200, types.WithdrawbalanceResponse200>> {
    return this.core.fetch('/wallet/withdrawbalance', 'post', body);
  }

  /**
   * This interface has been deprecated.
   *
   * @summary EasyTransferByPrivate
   * @throws FetchError<400, types.EasytransferbyprivateResponse400> 400
   */
  easytransferbyprivate(body: types.EasytransferbyprivateBodyParam): Promise<FetchResponse<200, types.EasytransferbyprivateResponse200>> {
    return this.core.fetch('/wallet/easytransferbyprivate', 'post', body);
  }

  /**
   * Queries a contract's information from the blockchain, including the bytecode of the
   * contract, ABI, configuration parameters, etc.
   *
   * @summary GetContract
   * @throws FetchError<400, types.WalletGetcontractResponse400> 400
   */
  walletGetcontract(body?: types.WalletGetcontractBodyParam): Promise<FetchResponse<200, types.WalletGetcontractResponse200>> {
    return this.core.fetch('/wallet/getcontract', 'post', body);
  }

  /**
   * Returns TransactionExtention, which contains the unsigned Transaction
   *
   * @summary TriggerSmartContract
   * @throws FetchError<400, types.TriggersmartcontractResponse400> 400
   */
  triggersmartcontract(body: types.TriggersmartcontractBodyParam): Promise<FetchResponse<200, types.TriggersmartcontractResponse200>> {
    return this.core.fetch('/wallet/triggersmartcontract', 'post', body);
  }

  /**
   * Creates a trading pair.
   *
   * @summary ExchangeCreate
   * @throws FetchError<400, types.ExchangecreateResponse400> 400
   */
  exchangecreate(body?: types.ExchangecreateBodyParam): Promise<FetchResponse<200, types.ExchangecreateResponse200>> {
    return this.core.fetch('/wallet/exchangecreate', 'post', body);
  }

  /**
   * Query Node Information. Returns information about current state of node.
   *
   * @summary GetNodeInfo
   * @throws FetchError<400, types.WalletGetnodeinfoResponse400> 400
   */
  walletGetnodeinfo(): Promise<FetchResponse<200, types.WalletGetnodeinfoResponse200>> {
    return this.core.fetch('/wallet/getnodeinfo', 'get');
  }

  /**
   * Update the consume_user_resource_percent parameter of a smart contract
   *
   * @summary UpdateSetting
   * @throws FetchError<400, types.WalletUpdatesettingResponse400> 400
   */
  walletUpdatesetting(body: types.WalletUpdatesettingBodyParam): Promise<FetchResponse<200, types.WalletUpdatesettingResponse200>> {
    return this.core.fetch('/wallet/updatesetting', 'post', body);
  }

  /**
   * Update the origin_energy_limit parameter of a smart contract
   *
   * @summary UpdateEnergyLimit
   * @throws FetchError<400, types.WalletUpdateenergylimitResponse400> 400
   */
  walletUpdateenergylimit(body?: types.WalletUpdateenergylimitBodyParam): Promise<FetchResponse<200, types.WalletUpdateenergylimitResponse200>> {
    return this.core.fetch('/wallet/updateenergylimit', 'post', body);
  }

  /**
   * This interface has been deprecated.
   *
   * @summary EasyTransferAsset
   * @throws FetchError<400, types.EasytransferassetResponse400> 400
   */
  easytransferasset(body?: types.EasytransferassetBodyParam): Promise<FetchResponse<200, types.EasytransferassetResponse200>> {
    return this.core.fetch('/wallet/easytransferasset', 'post', body);
  }

  /**
   * Query the resource delegation by an account during stake1.0 phase. i.e. list all
   * addresses that have delegated resources to an account.
   *
   * @summary GetDelegatedResourceAccountIndex
   * @throws FetchError<400, types.GetdelegatedresourceaccountindexResponse400> 400
   */
  getdelegatedresourceaccountindex(body?: types.GetdelegatedresourceaccountindexBodyParam): Promise<FetchResponse<200, types.GetdelegatedresourceaccountindexResponse200>> {
    return this.core.fetch('/wallet/getdelegatedresourceaccountindex', 'post', body);
  }

  /**
   * This interface has been deprecated.
   *
   * @summary EasyTransferAssetByPrivate
   * @throws FetchError<400, types.EasytransferassetbyprivateResponse400> 400
   */
  easytransferassetbyprivate(body?: types.EasytransferassetbyprivateBodyParam): Promise<FetchResponse<200, types.EasytransferassetbyprivateResponse200>> {
    return this.core.fetch('/wallet/easytransferassetbyprivate', 'post', body);
  }

  /**
   * Returns all resources delegations during stake1.0 phase from an account to another
   * account. The fromAddress can be retrieved from the GetDelegatedResourceAccountIndex API.
   *
   * @summary GetDelegatedResource
   * @throws FetchError<400, types.GetdelegatedresourceResponse400> 400
   */
  getdelegatedresource(body: types.GetdelegatedresourceBodyParam): Promise<FetchResponse<200, types.GetdelegatedresourceResponse200>> {
    return this.core.fetch('/wallet/getdelegatedresource', 'post', body);
  }

  /**
   * Query the transaction fee, block height by transaction id
   *
   * @summary GetTransactionInfoById
   */
  gettransactioninfobyid(body?: types.GettransactioninfobyidBodyParam): Promise<FetchResponse<200, types.GettransactioninfobyidResponse200>> {
    return this.core.fetch('/wallet/gettransactioninfobyid', 'post', body);
  }

  /**
   * Edit the URL of the witness's official website.
   *
   * @summary UpdateWitness
   */
  updatewitness(body?: types.UpdatewitnessBodyParam): Promise<FetchResponse<200, types.UpdatewitnessResponse200>> {
    return this.core.fetch('/wallet/updatewitness', 'post', body);
  }

  /**
   * To clear the ABI info of a smart contract.
   *
   * @summary ClearAbi
   * @throws FetchError<400, types.ClearabiResponse400> 400
   */
  clearabi(body?: types.ClearabiBodyParam): Promise<FetchResponse<200, types.ClearabiResponse200>> {
    return this.core.fetch('/wallet/clearabi', 'post', body);
  }

  /**
   * Invoke the readonly function (modified by the `view` or `pure` modifier) of a contract
   * for contract data query; or Invoke the non-readonly function of a  contract for
   * predicting whether the transaction can be successfully executed and estimating the
   * energy consumption; or estimate the energy consumption of contract deployment
   *
   * @summary TriggerConstantContract
   * @throws FetchError<400, types.TriggerconstantcontractResponse400> 400
   */
  triggerconstantcontract(body?: types.TriggerconstantcontractBodyParam): Promise<FetchResponse<200, types.TriggerconstantcontractResponse200>> {
    return this.core.fetch('/wallet/triggerconstantcontract', 'post', body);
  }

  /**
   * Update the witness's brokerage setting.
   *
   * @summary UpdateBrokerage
   * @throws FetchError<400, types.WalletUpdatebrokerageResponse400> 400
   */
  walletUpdatebrokerage(body?: types.WalletUpdatebrokerageBodyParam): Promise<FetchResponse<200, types.WalletUpdatebrokerageResponse200>> {
    return this.core.fetch('/wallet/updateBrokerage', 'post', body);
  }

  /**
   * Get SR brokerage ratio
   *
   * @summary GetBrokerage
   * @throws FetchError<400, types.WalletGetbrokerageResponse400> 400
   */
  walletGetbrokerage(body?: types.WalletGetbrokerageBodyParam): Promise<FetchResponse<200, types.WalletGetbrokerageResponse200>> {
    return this.core.fetch('/wallet/getBrokerage', 'post', body);
  }

  /**
   * Get the rewards that a witness or a user has not yet withdrawn.
   *
   * @summary GetReward
   * @throws FetchError<400, types.WalletGetrewardResponse400> 400
   */
  walletGetreward(body?: types.WalletGetrewardBodyParam): Promise<FetchResponse<200, types.WalletGetrewardResponse200>> {
    return this.core.fetch('/wallet/getReward', 'post', body);
  }

  /**
   * Query the resource information of an account(bandwidth,energy,etc)
   *
   * @summary GetAccountResource
   * @throws FetchError<400, types.GetaccountresourceResponse400> 400
   */
  getaccountresource(body?: types.GetaccountresourceBodyParam): Promise<FetchResponse<200, types.GetaccountresourceResponse200>> {
    return this.core.fetch('/wallet/getaccountresource', 'post', body);
  }

  /**
   * All parameters that the blockchain committee can set
   *
   * @summary GetChainParameters
   * @throws FetchError<400, types.WalletGetchainparametersResponse400> 400
   */
  walletGetchainparameters(): Promise<FetchResponse<200, types.WalletGetchainparametersResponse200>> {
    return this.core.fetch('/wallet/getchainparameters', 'get');
  }

  /**
   * Broadcast the protobuf encoded transaction hex string after sign
   *
   * @summary BroadcastHex
   * @throws FetchError<400, types.BroadcasthexResponse400> 400
   */
  broadcasthex(body: types.BroadcasthexBodyParam): Promise<FetchResponse<200, types.BroadcasthexResponse200>> {
    return this.core.fetch('/wallet/broadcasthex', 'post', body);
  }

  /**
   * GetTransactionInfoByBlockNum
   *
   * @throws FetchError<400, types.GettransactioninfobyblocknumResponse400> 400
   */
  gettransactioninfobyblocknum(body?: types.GettransactioninfobyblocknumBodyParam): Promise<FetchResponse<200, types.GettransactioninfobyblocknumResponse200>> {
    return this.core.fetch('/wallet/gettransactioninfobyblocknum', 'post', body);
  }

  /**
   * Update the account's permission.
   *
   * @summary AccountPermissionUpdate
   * @throws FetchError<400, types.AccountpermissionupdateResponse400> 400
   */
  accountpermissionupdate(body?: types.AccountpermissionupdateBodyParam): Promise<FetchResponse<200, types.AccountpermissionupdateResponse200>> {
    return this.core.fetch('/wallet/accountpermissionupdate', 'post', body);
  }

  /**
   * Note:To ensure security, Trongrid has disabled this interface service, please use the
   * service provided by the local node.
   *
   * @summary GetSpendingKey
   * @throws FetchError<400, types.GetspendingkeyResponse400> 400
   */
  getspendingkey(): Promise<FetchResponse<200, types.GetspendingkeyResponse200>> {
    return this.core.fetch('/wallet/getspendingkey', 'get');
  }

  /**
   * Note:To ensure security, Trongrid has disabled this interface service, please use the
   * service provided by the local node.
   *
   * @summary GetExpandedSpendingKey
   * @throws FetchError<400, types.GetexpandedspendingkeyResponse400> 400
   */
  getexpandedspendingkey(body?: types.GetexpandedspendingkeyBodyParam): Promise<FetchResponse<200, types.GetexpandedspendingkeyResponse200>> {
    return this.core.fetch('/wallet/getexpandedspendingkey', 'post', body);
  }

  /**
   * GetZenPaymentAddress
   *
   * @throws FetchError<400, types.GetzenpaymentaddressResponse400> 400
   */
  getzenpaymentaddress(body: types.GetzenpaymentaddressBodyParam): Promise<FetchResponse<200, types.GetzenpaymentaddressResponse200>> {
    return this.core.fetch('/wallet/getzenpaymentaddress', 'post', body);
  }

  /**
   * Note:To ensure security, Trongrid has disabled this interface service, please use the
   * service provided by the local node.
   *
   * @summary GetAkFromAsk
   * @throws FetchError<400, types.GetakfromaskResponse400> 400
   */
  getakfromask(body: types.GetakfromaskBodyParam): Promise<FetchResponse<200, types.GetakfromaskResponse200>> {
    return this.core.fetch('/wallet/getakfromask', 'post', body);
  }

  /**
   * GetNkFromNsk
   *
   * @throws FetchError<400, types.GetnkfromnskResponse400> 400
   */
  getnkfromnsk(body: types.GetnkfromnskBodyParam): Promise<FetchResponse<200, types.GetnkfromnskResponse200>> {
    return this.core.fetch('/wallet/getnkfromnsk', 'post', body);
  }

  /**
   * Note:To ensure security, Trongrid has disabled this interface service, please use the
   * service provided by the local node.
   *
   * @summary GetNewShieldedAddress
   * @throws FetchError<400, types.GetnewshieldedaddressResponse400> 400
   */
  getnewshieldedaddress(): Promise<FetchResponse<200, types.GetnewshieldedaddressResponse200>> {
    return this.core.fetch('/wallet/getnewshieldedaddress', 'get');
  }

  /**
   * Note:To ensure security, Trongrid has disabled this interface service, please use the
   * service provided by the local node.
   *
   * @summary CreateShieldedContractParameters
   * @throws FetchError<400, types.CreateshieldedcontractparametersResponse400> 400
   */
  createshieldedcontractparameters(body: types.CreateshieldedcontractparametersBodyParam): Promise<FetchResponse<200, types.CreateshieldedcontractparametersResponse200>> {
    return this.core.fetch('/wallet/createshieldedcontractparameters', 'post', body);
  }

  /**
   * GetDiversifier
   *
   * @throws FetchError<400, types.GetdiversifierResponse400> 400
   */
  getdiversifier(): Promise<FetchResponse<200, types.GetdiversifierResponse200>> {
    return this.core.fetch('/wallet/getdiversifier', 'get');
  }

  /**
   * GetIncomingViewingKey
   *
   * @throws FetchError<400, types.GetincomingviewingkeyResponse400> 400
   */
  getincomingviewingkey(body: types.GetincomingviewingkeyBodyParam): Promise<FetchResponse<200, types.GetincomingviewingkeyResponse200>> {
    return this.core.fetch('/wallet/getincomingviewingkey', 'post', body);
  }

  /**
   * Note:To ensure security, Trongrid has disabled this interface service, please use the
   * service provided by the local node.
   *
   * @summary CreateSpendAuthSig
   * @throws FetchError<400, types.CreatespendauthsigResponse400> 400
   */
  createspendauthsig(body: types.CreatespendauthsigBodyParam): Promise<FetchResponse<200, types.CreatespendauthsigResponse200>> {
    return this.core.fetch('/wallet/createspendauthsig', 'post', body);
  }

  /**
   * GetTriggerInputForShieldedTrc20Contract
   *
   * @throws FetchError<400, types.Gettriggerinputforshieldedtrc20ContractResponse400> 400
   */
  gettriggerinputforshieldedtrc20contract(): Promise<FetchResponse<200, types.Gettriggerinputforshieldedtrc20ContractResponse200>> {
    return this.core.fetch('/wallet/gettriggerinputforshieldedtrc20contract', 'post');
  }

  /**
   * IsShieldedTrc20ContractNoteSpent
   *
   * @throws FetchError<400, types.Isshieldedtrc20ContractnotespentResponse400> 400
   */
  isshieldedtrc20contractnotespent(body: types.Isshieldedtrc20ContractnotespentBodyParam): Promise<FetchResponse<200, types.Isshieldedtrc20ContractnotespentResponse200>> {
    return this.core.fetch('/wallet/isshieldedtrc20contractnotespent', 'post', body);
  }

  /**
   * Scan outgoing notes(spent).
   *
   * @summary ScanShieldedTrc20NotesByOvk
   * @throws FetchError<400, types.Scanshieldedtrc20NotesbyovkResponse400> 400
   */
  scanshieldedtrc20notesbyovk(body: types.Scanshieldedtrc20NotesbyovkBodyParam): Promise<FetchResponse<200, types.Scanshieldedtrc20NotesbyovkResponse200>> {
    return this.core.fetch('/wallet/scanshieldedtrc20notesbyovk', 'post', body);
  }

  /**
   * Scan outgoing notes.
   *
   * @summary ScanShieldedTrc20NotesByIvk
   * @throws FetchError<400, types.Scanshieldedtrc20NotesbyivkResponse400> 400
   */
  scanshieldedtrc20notesbyivk(body: types.Scanshieldedtrc20NotesbyivkBodyParam): Promise<FetchResponse<200, types.Scanshieldedtrc20NotesbyivkResponse200>> {
    return this.core.fetch('/wallet/scanshieldedtrc20notesbyivk', 'post', body);
  }

  /**
   * Get transaction details from the pending pool
   *
   * @summary GetTransactionFromPending
   * @throws FetchError<400, types.GettransactionfrompendingResponse400> 400
   */
  gettransactionfrompending(body?: types.GettransactionfrompendingBodyParam): Promise<FetchResponse<200, types.GettransactionfrompendingResponse200>> {
    return this.core.fetch('/wallet/gettransactionfrompending', 'post', body);
  }

  /**
   * Get transaction list information from pending pool
   *
   * @summary GetTransactionListFromPending
   * @throws FetchError<400, types.GettransactionlistfrompendingResponse400> 400
   */
  gettransactionlistfrompending(): Promise<FetchResponse<200, types.GettransactionlistfrompendingResponse200>> {
    return this.core.fetch('/wallet/gettransactionlistfrompending', 'get');
  }

  /**
   * Get the size of the pending pool queue
   *
   * @summary GetPendingSize
   * @throws FetchError<400, types.GetpendingsizeResponse400> 400
   */
  getpendingsize(): Promise<FetchResponse<200, types.GetpendingsizeResponse200>> {
    return this.core.fetch('/wallet/getpendingsize', 'get');
  }

  /**
   * Get all balance change operations in a block.(Note: At present, the interface data can
   * only be queried through the following official nodes 13.228.119.63 &
   * 18.139.193.235&18.141.79.38 &18.139.248.26)
   *
   * @summary GetBlockBalance
   * @throws FetchError<400, types.GetblockbalanceResponse400> 400
   */
  getblockbalance(body?: types.GetblockbalanceBodyParam): Promise<FetchResponse<200, types.GetblockbalanceResponse200>> {
    return this.core.fetch('/wallet/getblockbalance', 'post', body);
  }

  /**
   * Get the account balance in a specific block.(Note: At present, the interface data can
   * only be queried through the following official nodes 13.228.119.63 & 18.139.193.235 &
   * 18.141.79.38 & 18.139.248.26)
   *
   * @summary GetAccountBalance
   * @throws FetchError<400, types.GetaccountbalanceResponse400> 400
   */
  getaccountbalance(body?: types.GetaccountbalanceBodyParam): Promise<FetchResponse<200, types.GetaccountbalanceResponse200>> {
    return this.core.fetch('/wallet/getaccountbalance', 'post', body);
  }

  /**
   * Queries a contract's information from the blockchain. The difference from the
   * `wallet/getcontract` interface is that this interface returns not only the `bytecode`
   * but also the `runtime bytecode` of the contract. Compared with `bytecode`, `runtime
   * bytecode` does not contain constructor and constructor parameter information.
   *
   * @summary GetContractInfo
   * @throws FetchError<400, types.GetcontractinfoResponse400> 400
   */
  getcontractinfo(body?: types.GetcontractinfoBodyParam): Promise<FetchResponse<200, types.GetcontractinfoResponse200>> {
    return this.core.fetch('/wallet/getcontractinfo', 'post', body);
  }

  /**
   * Query historical energy unit price
   *
   * @summary GetEnergyPrices
   */
  getenergyprices(): Promise<FetchResponse<number, unknown>> {
    return this.core.fetch('/wallet/getenergyprices', 'get');
  }

  /**
   * Query historical bandwidth unit price
   *
   * @summary GetBandwidthPrices
   */
  getbandwidthprices(): Promise<FetchResponse<200, types.GetbandwidthpricesResponse200>> {
    return this.core.fetch('/wallet/getbandwidthprices', 'get');
  }

  /**
   * Query block header information or entire block information according to block height or
   * block hash
   *
   * @summary GetBlock
   */
  getblock1(body?: types.Getblock1BodyParam): Promise<FetchResponse<200, types.Getblock1Response200>> {
    return this.core.fetch('/wallet/getblock', 'post', body);
  }

  /**
   * Estimate the energy required for the successful execution of smart contract transactions
   * or deploying a contract
   *
   * @summary EstimateEnergy
   * @throws FetchError<400, types.EstimateenergyResponse400> 400
   */
  estimateenergy(body?: types.EstimateenergyBodyParam): Promise<FetchResponse<200, types.EstimateenergyResponse200>> {
    return this.core.fetch('/wallet/estimateenergy', 'post', body);
  }

  /**
   * Query the amount of TRX burned due to on-chain transaction fees since [No. 54 Committee
   * Proposal ](https://tronscan.org/#/proposal/54) took effect
   *
   * @summary GetBurnTRX
   */
  getburntrx(): Promise<FetchResponse<200, types.GetburntrxResponse200>> {
    return this.core.fetch('/wallet/getburntrx', 'get');
  }

  /**
   * In Stake2.0, stake an amount of TRX to obtain bandwidth or energy, and obtain equivalent
   * TRON Power(TP) according to the staked amount
   *
   * @summary FreezeBalanceV2
   * @throws FetchError<400, types.Freezebalancev21Response400> 400
   */
  freezebalancev21(body: types.Freezebalancev21BodyParam): Promise<FetchResponse<200, types.Freezebalancev21Response200>> {
    return this.core.fetch('/wallet/freezebalancev2', 'post', body);
  }

  /**
   * Unstake some TRX staked in Stake2.0, release the corresponding amount of bandwidth or
   * energy, and voting rights (TP)
   *
   * @summary UnfreezeBalanceV2
   * @throws FetchError<400, types.Unfreezebalancev21Response400> 400
   */
  unfreezebalancev21(body?: types.Unfreezebalancev21BodyParam): Promise<FetchResponse<200, types.Unfreezebalancev21Response200>> {
    return this.core.fetch('/wallet/unfreezebalancev2', 'post', body);
  }

  /**
   * Delegate bandwidth or energy resources to other accounts in Stake2.0.
   *
   * @summary DelegateResource
   * @throws FetchError<400, types.Delegateresource1Response400> 400
   */
  delegateresource1(body?: types.Delegateresource1BodyParam): Promise<FetchResponse<200, types.Delegateresource1Response200>> {
    return this.core.fetch('/wallet/delegateresource', 'post', body);
  }

  /**
   * Withdraw unfrozen balance in Stake2.0,  the user can call this API to get back their
   * funds after executing /wallet/unfreezebalancev2 transaction and waiting N days, N is a
   * network parameter
   *
   * @summary WithdrawExpireUnfreeze
   * @throws FetchError<400, types.WithdrawexpireunfreezeResponse400> 400
   */
  withdrawexpireunfreeze(body?: types.WithdrawexpireunfreezeBodyParam): Promise<FetchResponse<200, types.WithdrawexpireunfreezeResponse200>> {
    return this.core.fetch('/wallet/withdrawexpireunfreeze', 'post', body);
  }

  /**
   * Cancel the delegation of bandwidth or energy resources to other accounts in Stake2.0
   *
   * @summary UnDelegateResource
   * @throws FetchError<400, types.Undelegateresource1Response400> 400
   */
  undelegateresource1(body?: types.Undelegateresource1BodyParam): Promise<FetchResponse<200, types.Undelegateresource1Response200>> {
    return this.core.fetch('/wallet/undelegateresource', 'post', body);
  }

  /**
   * Remaining times of executing unstake operation in Stake2.0
   *
   * @summary GetAvailableUnfreezeCount
   * @throws FetchError<400, types.Getavailableunfreezecount1Response400> 400
   */
  getavailableunfreezecount1(body?: types.Getavailableunfreezecount1BodyParam): Promise<FetchResponse<200, types.Getavailableunfreezecount1Response200>> {
    return this.core.fetch('/wallet/getavailableunfreezecount', 'post', body);
  }

  /**
   * Query the withdrawable balance at the specified timestamp In Stake2.0
   *
   * @summary GetCanWithdrawUnfreezeAmount
   * @throws FetchError<400, types.Getcanwithdrawunfreezeamount1Response400> 400
   */
  getcanwithdrawunfreezeamount1(body?: types.Getcanwithdrawunfreezeamount1BodyParam): Promise<FetchResponse<200, types.Getcanwithdrawunfreezeamount1Response200>> {
    return this.core.fetch('/wallet/getcanwithdrawunfreezeamount', 'post', body);
  }

  /**
   * In Stake2.0, query the amount of delegatable resources share of the specified resource
   * type for an address, unit is sun.
   *
   * @summary GetCanDelegatedMaxSize
   * @throws FetchError<400, types.GetcandelegatedmaxsizeResponse400> 400
   */
  getcandelegatedmaxsize(body?: types.GetcandelegatedmaxsizeBodyParam): Promise<FetchResponse<200, types.GetcandelegatedmaxsizeResponse200>> {
    return this.core.fetch('/wallet/getcandelegatedmaxsize', 'post', body);
  }

  /**
   * In Stake2.0, query the detail of resource share delegated from fromAddress to toAddress
   *
   * @summary GetDelegatedResourceV2
   * @throws FetchError<400, types.Getdelegatedresourcev2Response400> 400
   */
  getdelegatedresourcev2(body?: types.Getdelegatedresourcev2BodyParam): Promise<FetchResponse<200, types.Getdelegatedresourcev2Response200>> {
    return this.core.fetch('/wallet/getdelegatedresourcev2', 'post', body);
  }

  /**
   * In Stake2.0, query the resource delegation index by an account. Two lists will return,
   * one is the list of addresses the account has delegated its resources(toAddress), and the
   * other is the list of addresses that have delegated resources to the
   * account(fromAddress).
   *
   * @summary GetDelegatedResourceAccountIndexV2
   * @throws FetchError<400, types.Getdelegatedresourceaccountindexv21Response400> 400
   */
  getdelegatedresourceaccountindexv21(body?: types.Getdelegatedresourceaccountindexv21BodyParam): Promise<FetchResponse<200, types.Getdelegatedresourceaccountindexv21Response200>> {
    return this.core.fetch('/wallet/getdelegatedresourceaccountindexv2', 'post', body);
  }

  /**
   * Query a token by name, returns token info.
   *
   * @summary GetAssetIssueByName
   */
  getassetissuebynameCopy(body?: types.GetassetissuebynameCopyBodyParam): Promise<FetchResponse<number, unknown>> {
    return this.core.fetch('/wallet/getassetissuebyname', 'post', body);
  }

  /**
   * Query the list of all the TRC10 tokens by a name.
   *
   * @summary GetAssetIssueListByName
   */
  getassetissuelistbynameCopy(body?: types.GetassetissuelistbynameCopyBodyParam): Promise<FetchResponse<number, unknown>> {
    return this.core.fetch('/wallet/getassetissuelistbyname', 'post', body);
  }

  /**
   * Cancel unstakings, all unstaked funds still in the waiting period will be re-staked, all
   * unstaked funds that exceeded the 14-day waiting period will be automatically withdrawn
   * to the owner’s account
   *
   * @summary CancelAllUnfreezeV2
   * @throws FetchError<400, types.Cancelallunfreezev2Response400> 400
   */
  cancelallunfreezev2(body?: types.Cancelallunfreezev2BodyParam): Promise<FetchResponse<200, types.Cancelallunfreezev2Response200>> {
    return this.core.fetch('/wallet/cancelallunfreezev2', 'post', body);
  }

  /**
   * Query the account address list which signed the transaction.
   *
   * @summary GetApprovedList
   */
  httpGetapprovedlist(body: types.HttpGetapprovedlistBodyParam): Promise<FetchResponse<200, types.HttpGetapprovedlistResponse200>> {
    return this.core.fetch('/wallet/getapprovedlist', 'post', body);
  }
}

const createSDK = (() => { return new SDK(); })()
;

export default createSDK;

export type { AccountCreateaccountBodyParam, AccountCreateaccountResponse200, AccountCreateaccountResponse400, AccountGetaccountBodyParam, AccountGetaccountResponse200, AccountGetaccountResponse400, AccountResourcesFreezebalanceBodyParam, AccountResourcesFreezebalanceResponse200, AccountResourcesFreezebalanceResponse400, AccountResourcesUnfreezebalanceBodyParam, AccountResourcesUnfreezebalanceResponse200, AccountResourcesUnfreezebalanceResponse400, AccountpermissionupdateBodyParam, AccountpermissionupdateResponse200, AccountpermissionupdateResponse400, BroadcasthexBodyParam, BroadcasthexResponse200, BroadcasthexResponse400, BroadcasttransactionBodyParam, BroadcasttransactionResponse200, Cancelallunfreezev2BodyParam, Cancelallunfreezev2Response200, Cancelallunfreezev2Response400, ClearabiBodyParam, ClearabiResponse200, ClearabiResponse400, CreateaddressBodyParam, CreateaddressResponse200, CreateaddressResponse400, CreateassetissueBodyParam, CreateshieldedcontractparametersBodyParam, CreateshieldedcontractparametersResponse200, CreateshieldedcontractparametersResponse400, CreatespendauthsigBodyParam, CreatespendauthsigResponse200, CreatespendauthsigResponse400, CreatetransactionBodyParam, CreatetransactionResponse200, CreatetransactionResponse400, CreatewitnessBodyParam, CreatewitnessResponse200, CreatewitnessResponse400, Delegateresource1BodyParam, Delegateresource1Response200, Delegateresource1Response400, EasytransferBodyParam, EasytransferResponse200, EasytransferResponse400, EasytransferassetBodyParam, EasytransferassetResponse200, EasytransferassetResponse400, EasytransferassetbyprivateBodyParam, EasytransferassetbyprivateResponse200, EasytransferassetbyprivateResponse400, EasytransferbyprivateBodyParam, EasytransferbyprivateResponse200, EasytransferbyprivateResponse400, EstimateenergyBodyParam, EstimateenergyResponse200, EstimateenergyResponse400, ExchangecreateBodyParam, ExchangecreateResponse200, ExchangecreateResponse400, ExchangeinjectBodyParam, ExchangeinjectResponse200, ExchangeinjectResponse400, ExchangetransactionBodyParam, ExchangetransactionResponse200, ExchangetransactionResponse400, ExchangewithdrawBodyParam, ExchangewithdrawResponse200, ExchangewithdrawResponse400, Freezebalancev21BodyParam, Freezebalancev21Response200, Freezebalancev21Response400, GenerateaddressResponse200, GenerateaddressResponse400, GetaccountbalanceBodyParam, GetaccountbalanceResponse200, GetaccountbalanceResponse400, GetaccountnetBodyParam, GetaccountnetResponse200, GetaccountresourceBodyParam, GetaccountresourceResponse200, GetaccountresourceResponse400, GetakfromaskBodyParam, GetakfromaskResponse200, GetakfromaskResponse400, GetassetissuebyaccountBodyParam, GetassetissuebyidBodyParam, GetassetissuebynameCopyBodyParam, GetassetissuelistbynameCopyBodyParam, Getavailableunfreezecount1BodyParam, Getavailableunfreezecount1Response200, Getavailableunfreezecount1Response400, GetbandwidthpricesResponse200, Getblock1BodyParam, Getblock1Response200, GetblockbalanceBodyParam, GetblockbalanceResponse200, GetblockbalanceResponse400, GetblockbyidBodyParam, GetblockbyidResponse200, GetblockbylimitnextBodyParam, GetblockbylimitnextResponse200, GetblockbylimitnextResponse400, GetburntrxResponse200, GetcandelegatedmaxsizeBodyParam, GetcandelegatedmaxsizeResponse200, GetcandelegatedmaxsizeResponse400, Getcanwithdrawunfreezeamount1BodyParam, Getcanwithdrawunfreezeamount1Response200, Getcanwithdrawunfreezeamount1Response400, GetcontractinfoBodyParam, GetcontractinfoResponse200, GetcontractinfoResponse400, GetdelegatedresourceBodyParam, GetdelegatedresourceResponse200, GetdelegatedresourceResponse400, GetdelegatedresourceaccountindexBodyParam, GetdelegatedresourceaccountindexResponse200, GetdelegatedresourceaccountindexResponse400, Getdelegatedresourceaccountindexv21BodyParam, Getdelegatedresourceaccountindexv21Response200, Getdelegatedresourceaccountindexv21Response400, Getdelegatedresourcev2BodyParam, Getdelegatedresourcev2Response200, Getdelegatedresourcev2Response400, GetdiversifierResponse200, GetdiversifierResponse400, GetexpandedspendingkeyBodyParam, GetexpandedspendingkeyResponse200, GetexpandedspendingkeyResponse400, GetincomingviewingkeyBodyParam, GetincomingviewingkeyResponse200, GetincomingviewingkeyResponse400, GetnewshieldedaddressResponse200, GetnewshieldedaddressResponse400, GetnextmaintenancetimeResponse200, GetnextmaintenancetimeResponse400, GetnkfromnskBodyParam, GetnkfromnskResponse200, GetnkfromnskResponse400, GetpaginatedassetissuelistBodyParam, GetpendingsizeResponse200, GetpendingsizeResponse400, GetproposalbyidBodyParam, GetproposalbyidResponse200, GetproposalbyidResponse400, GetspendingkeyResponse200, GetspendingkeyResponse400, GettransactionfrompendingBodyParam, GettransactionfrompendingResponse200, GettransactionfrompendingResponse400, GettransactioninfobyblocknumBodyParam, GettransactioninfobyblocknumResponse200, GettransactioninfobyblocknumResponse400, GettransactioninfobyidBodyParam, GettransactioninfobyidResponse200, GettransactionlistfrompendingResponse200, GettransactionlistfrompendingResponse400, GettransactionsignBodyParam, GettransactionsignResponse200, GettransactionsignResponse400, Gettriggerinputforshieldedtrc20ContractResponse200, Gettriggerinputforshieldedtrc20ContractResponse400, GetzenpaymentaddressBodyParam, GetzenpaymentaddressResponse200, GetzenpaymentaddressResponse400, HttpGetapprovedlistBodyParam, HttpGetapprovedlistResponse200, Isshieldedtrc20ContractnotespentBodyParam, Isshieldedtrc20ContractnotespentResponse200, Isshieldedtrc20ContractnotespentResponse400, ParticipateassetissueBodyParam, ParticipateassetissueResponse200, ParticipateassetissueResponse400, ProposalapproveBodyParam, ProposalapproveResponse200, ProposalapproveResponse400, ProposalcreateBodyParam, ProposalcreateResponse200, ProposalcreateResponse400, ProposaldeleteBodyParam, ProposaldeleteResponse200, ProposaldeleteResponse400, Scanshieldedtrc20NotesbyivkBodyParam, Scanshieldedtrc20NotesbyivkResponse200, Scanshieldedtrc20NotesbyivkResponse400, Scanshieldedtrc20NotesbyovkBodyParam, Scanshieldedtrc20NotesbyovkResponse200, Scanshieldedtrc20NotesbyovkResponse400, TransferassetBodyParam, TransferassetResponse200, TransferassetResponse400, TriggerconstantcontractBodyParam, TriggerconstantcontractResponse200, TriggerconstantcontractResponse400, TriggersmartcontractBodyParam, TriggersmartcontractResponse200, TriggersmartcontractResponse400, Undelegateresource1BodyParam, Undelegateresource1Response200, Undelegateresource1Response400, UnfreezeassetBodyParam, UnfreezeassetResponse200, UnfreezeassetResponse400, Unfreezebalancev21BodyParam, Unfreezebalancev21Response200, Unfreezebalancev21Response400, UpdateaccountBodyParam, UpdateaccountResponse200, UpdateaccountResponse400, UpdatewitnessBodyParam, UpdatewitnessResponse200, ValidateaddressBodyParam, ValidateaddressResponse200, ValidateaddressResponse400, VotewitnessaccountBodyParam, VotewitnessaccountResponse200, VotewitnessaccountResponse400, WalletDeploycontractBodyParam, WalletDeploycontractResponse200, WalletDeploycontractResponse400, WalletGetblockbylatestnumBodyParam, WalletGetblockbylatestnumResponse200, WalletGetblockbylatestnumResponse400, WalletGetblockbynumBodyParam, WalletGetblockbynumResponse200, WalletGetbrokerageBodyParam, WalletGetbrokerageResponse200, WalletGetbrokerageResponse400, WalletGetchainparametersResponse200, WalletGetchainparametersResponse400, WalletGetcontractBodyParam, WalletGetcontractResponse200, WalletGetcontractResponse400, WalletGetexchangebyidBodyParam, WalletGetexchangebyidResponse200, WalletGetexchangebyidResponse400, WalletGetnodeinfoResponse200, WalletGetnodeinfoResponse400, WalletGetnowblockResponse200, WalletGetrewardBodyParam, WalletGetrewardResponse200, WalletGetrewardResponse400, WalletGettransactionbyidBodyParam, WalletGettransactionbyidResponse200, WalletListexchangesMetadataParam, WalletListexchangesResponse200, WalletListexchangesResponse400, WalletListnodesResponse200, WalletListnodesResponse400, WalletListproposalsResponse200, WalletListproposalsResponse400, WalletUpdateassetBodyParam, WalletUpdateassetResponse200, WalletUpdateassetResponse400, WalletUpdatebrokerageBodyParam, WalletUpdatebrokerageResponse200, WalletUpdatebrokerageResponse400, WalletUpdateenergylimitBodyParam, WalletUpdateenergylimitResponse200, WalletUpdateenergylimitResponse400, WalletUpdatesettingBodyParam, WalletUpdatesettingResponse200, WalletUpdatesettingResponse400, WithdrawbalanceBodyParam, WithdrawbalanceResponse200, WithdrawbalanceResponse400, WithdrawexpireunfreezeBodyParam, WithdrawexpireunfreezeResponse200, WithdrawexpireunfreezeResponse400 } from './types';
