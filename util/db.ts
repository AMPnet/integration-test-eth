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

export async function countBlockchainTasks(): Promise<any> {
    return identityDb.raw('SELECT COUNT(*) FROM blockchain_task;')
}
