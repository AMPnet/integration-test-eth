# Integration test

Repo for integration tests for AMPnet crowdfunding project on EVM.

## Usage

To start the test run following:

```shell
npm install
docker-compose pull
docker-compose up -d
# Wait until all services are up and running
npm run test
```

## Service

Test will start following services in docker compose:

* Identity-service
* Postgres database
* Hardhat

## TODO

Current implatition 
