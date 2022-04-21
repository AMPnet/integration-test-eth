CREATE DATABASE identity_service ENCODING 'UTF-8';
CREATE USER identity_service WITH PASSWORD 'password';

CREATE DATABASE report_service_eth ENCODING 'UTF-8';
CREATE USER report_service_eth WITH PASSWORD 'password';

CREATE DATABASE payout_service_eth ENCODING 'UTF-8';
CREATE USER payout_service_eth WITH PASSWORD 'password';

GRANT CREATE ON DATABASE payout_service_eth TO payout_service_eth;

CREATE DATABASE blockchain_api_service_eth ENCODING 'UTF-8';
CREATE USER blockchain_api_service_eth WITH PASSWORD 'password';

GRANT CREATE ON DATABASE blockchain_api_service_eth TO blockchain_api_service_eth;
