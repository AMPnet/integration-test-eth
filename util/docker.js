let path = require('path')

let compose = require('docker-compose')
let Healthcheck = require('@danielwpz/health-check')
let HTTPChecker = Healthcheck.HTTPChecker
const util = require('util')
let shell = util.promisify(require('child_process').exec)

const dockerComposeLocation = path.join(__dirname, '..')

const intervalBetweenChecks = 6000 // 6 seconds between every new healthcheck
const maxNumberOfChecks = 30       // maximum of 30 checks after giving up which makes total of 3 minutes waiting time at the worst case

const sleep = time => new Promise(resolve => setTimeout(resolve, time))

async function shellCommand(command) {
    console.log(`exec command: ${command}`)
    const { stdout, stderr } = await shell(command);

    console.log(`command [${command}] result: ${stdout}`)

    if (stderr) {
        console.error(`exec error [${command}]: ${stderr}`);
    }
}

async function createNetwork() {
    await shellCommand('docker network create --driver bridge integration-test-eth')
}

async function removeNetwork() {
    await shellCommand('docker network rm integration-test-eth')
}

const network = {
    create: createNetwork,
    remove: removeNetwork
}

async function upHardhat() {
    await compose.upAll({
        cwd: dockerComposeLocation,
        log: true,
        composeOptions: ["-f", "docker-compose-hardhat.yml", "-p", "integration-test-eth-hardhat"],
        commandOptions: ["--build"]
    }).catch(err => {
        console.log("docker-compose up error (hardhat): ", err)
    })
    const hardHatServiceChecker = new HTTPChecker('Hard Hat Service checker', 'http://localhost:8545/')
    await healthcheck([hardHatServiceChecker])
}

async function downHardhat() {
    await compose.down({
        cwd: dockerComposeLocation,
        composeOptions: ["-f", "docker-compose-hardhat.yml", "-p", "integration-test-eth-hardhat"],
        commandOptions: ["-v", "--rmi", "local"],
        log: true
    }).catch(err => {
        console.log("docker-compose down error (hardhat): ", err)
    })
}

async function restartHardhat() {
    await downHardhat();
    await upHardhat();
}

const hardhat = {
    up: upHardhat,
    down: downHardhat,
    restart: restartHardhat
}

async function upBackend(dockerEnv) {
    await compose.upAll({
        cwd: dockerComposeLocation,
        log: true,
        composeOptions: ["-f", "docker-compose-backend.yml", "-p", "integration-test-eth-backend"],
        commandOptions: ["--build"],
        env: {...process.env, ...dockerEnv}
    }).catch(err => {
        console.log("docker-compose up error (backend): ", err)
    })
    const identityServiceChecker = new HTTPChecker('Identity Service checker', 'http://localhost:8136/actuator/health')
    const reportServiceChecker = new HTTPChecker('Report Service checker', 'http://localhost:8137/actuator/health')
    const payoutServiceChecker = new HTTPChecker('Payout Service checker', 'http://localhost:8138/actuator/health')
    await healthcheck([identityServiceChecker, reportServiceChecker, payoutServiceChecker])
}

async function downBackend() {
    await compose.down({
        cwd: dockerComposeLocation,
        composeOptions: ["-f", "docker-compose-backend.yml", "-p", "integration-test-eth-backend"],
        commandOptions: ["-v", "--rmi", "local"],
        log: true
    }).catch(err => {
        console.log("docker-compose down error (backend): ", err)
    })
}

const backend = {
    up: upBackend,
    down: downBackend
}

async function upBlockchainApi() {
    await compose.upAll({
        cwd: dockerComposeLocation,
        log: true,
        composeOptions: ["-f", "docker-compose-blockchain-api.yml", "-p", "integration-test-eth-blockchain-api"],
        commandOptions: ["--build"],
        env: {...process.env}
    }).catch(err => {
        console.log("docker-compose up error (backend): ", err)
    })
    const blockchainApiServiceChecker = new HTTPChecker('Blockchain API Service checker', 'http://localhost:8139/actuator/health')
    await healthcheck([blockchainApiServiceChecker])
}

async function downBlockchainApi() {
    await compose.down({
        cwd: dockerComposeLocation,
        composeOptions: ["-f", "docker-compose-blockchain-api.yml", "-p", "integration-test-eth-blockchain-api"],
        commandOptions: ["-v", "--rmi", "local"],
        log: true
    }).catch(err => {
        console.log("docker-compose down error (backend): ", err)
    })
}

const blockchainApi = {
    up: upBlockchainApi,
    down: downBlockchainApi
}

async function showLogs(services) {
    const logs = await compose.logs(services)
    console.log("logs result", logs)
}

async function healthcheck(checkers) {
    const healthcheck = new Healthcheck(checkers)
    let numberOfChecks = 0
    do {
        if (numberOfChecks >= maxNumberOfChecks) {
            throw new Error('Timeout error: Some docker services failed to start.')
        }
        await sleep(intervalBetweenChecks)
        status = await healthcheck.run()
        numberOfChecks++
        console.log(status)
    } while(
        !status
            .map(s => { return s.healthy })
            .reduce((prev, current) => { return prev && current })
        )
}

module.exports = {
    hardhat, backend, blockchainApi, network, showLogs
}
