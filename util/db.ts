const identityDb = require('knex')({
    client: 'pg',
    connection: {
        host: 'localhost',
        user: 'postgres',
        password: 'postgres',
        port: '5432',
        database: 'identity_service',
    }
})
const reportDb = require('knex')({
    client: 'pg',
    connection: {
        host: 'localhost',
        user: 'postgres',
        password: 'postgres',
        port: '5432',
        database: 'report_service_eth',
    }
})
const blockchainApiDb = require('knex')({
    client: 'pg',
    connection: {
        host: 'localhost',
        user: 'postgres',
        password: 'postgres',
        port: '5432',
        database: 'blockchain_api_service_eth',
    }
})

export async function clearDb() {
    return new Promise<void>(async resolve => {
        await identityDb.raw('TRUNCATE TABLE veriff_decision;')
        await identityDb.raw('TRUNCATE TABLE veriff_session;')
        await identityDb.raw('TRUNCATE TABLE app_user CASCADE;')
        await identityDb.raw('TRUNCATE TABLE user_info CASCADE;')
        await identityDb.raw('TRUNCATE TABLE blockchain_task;')
        await identityDb.raw('TRUNCATE TABLE pending_blockchain_address;')
        await identityDb.raw('TRUNCATE TABLE auto_invest_task;')
        await identityDb.raw('TRUNCATE TABLE auto_invest_task_history;')
        await identityDb.raw('TRUNCATE TABLE auto_invest_transaction;')
        await reportDb.raw('TRUNCATE TABLE event;')
        await reportDb.raw('TRUNCATE TABLE task;')
        resolve()
    })
}

export async function clearBlockchainApiDb() {
    return new Promise<void>(async resolve => {
        await blockchainApiDb.raw('TRUNCATE TABLE blockchain_api_service.client_info;')
        await blockchainApiDb.raw('TRUNCATE TABLE blockchain_api_service.erc20_send_request;')
        await blockchainApiDb.raw('TRUNCATE TABLE blockchain_api_service.erc20_balance_request;')
        resolve()
    })
}

export async function countBlockchainTasks(): Promise<any> {
    return identityDb.raw('SELECT COUNT(*) FROM blockchain_task;')
}

export async function countAutoInvestTasks(): Promise<any> {
    return identityDb.raw('SELECT COUNT(*) FROM auto_invest_task;')
}

export async function insertClientInfo(
  clientId: string,
  info: {
      chainId: number,
      tokenAddress: string,
      sendRedirectUrl?: string,
      balanceRedirectUrl?: string
  }
): Promise<any> {
    return blockchainApiDb.raw(
      `INSERT INTO blockchain_api_service.client_info(
           client_id, chain_id, token_address, send_redirect_url, balance_redirect_url
       )
       VALUES (
           '${clientId}', ${info.chainId}, '${info.tokenAddress}', '${info.sendRedirectUrl ?? ""}',
           '${info.balanceRedirectUrl ?? ""}'
       );`
    )
}
