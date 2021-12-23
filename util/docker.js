let path = require('path')

let compose = require('docker-compose')
let Healthcheck = require('@danielwpz/health-check')
let HTTPChecker = Healthcheck.HTTPChecker

const dockerComposeLocation = path.join(__dirname, '..')

const intervalBetweenChecks = 6000 // 6 seconds between every new healthcheck
const maxNumberOfChecks = 30       // maximum of 30 checks after giving up which makes total of 3 minutes waiting time at the worst case

const sleep = time => new Promise(resolve => setTimeout(resolve, time))

async function upHardhat() {
    await compose.upAll({
        cwd: dockerComposeLocation,
        log: true,
        composeOptions: ["-f", "docker-compose-hardhat.yml"],
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
        composeOptions: ["-f", "docker-compose-hardhat.yml"],
        log: true
    }).catch(err => {
        console.log("docker-compose down error (hardhat): ", err)
    })
}

const hardhat = {
    up: upHardhat,
    down: downHardhat
}

async function upBackend(dockerEnv) {
    await compose.upAll({
        cwd: dockerComposeLocation,
        log: true,
        composeOptions: ["-f", "docker-compose-backend.yml"],
        commandOptions: ["--build"],
        env: {...process.env, ...dockerEnv}
    }).catch(err => {
        console.log("docker-compose up error (backend): ", err)
    })
    const identityServiceChecker = new HTTPChecker('Identity Service checker', 'http://localhost:8136/actuator/health')
    const reportServiceChecker = new HTTPChecker('Report Service checker', 'http://localhost:8137/actuator/health')
    await healthcheck([identityServiceChecker, reportServiceChecker])
}

async function downBackend() {
    await compose.down({
        cwd: dockerComposeLocation,
        composeOptions: ["-f", "docker-compose-backend.yml"],
        log: true
    }).catch(err => {
        console.log("docker-compose down error (backend): ", err)
    })
}

const backend = {
    up: upBackend,
    down: downBackend
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
    hardhat, backend, showLogs
}
