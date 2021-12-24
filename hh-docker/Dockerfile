FROM node:14-alpine

ENV APP_ROOT /app

RUN mkdir ${APP_ROOT}
WORKDIR ${APP_ROOT}
ADD . ${APP_ROOT}

EXPOSE 8545

CMD [ "npm", "run", "node" ]
