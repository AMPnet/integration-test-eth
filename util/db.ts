
const knex = require('knex')({
    client: 'pg',
    connection: {
        host: 'localhost',
        user: 'postgres',
        password: 'postgres',
        port: '5432',
        database: 'identity_service',
    }
})

export async function clearAllTasks() {
    return new Promise<void>( async resolve => {
        await knex.raw('TRUNCATE TABLE blockchain_task;')
        resolve()
    })
}
