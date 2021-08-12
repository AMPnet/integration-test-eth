FROM node:16

ENV APP_ROOT /app

RUN mkdir ${APP_ROOT}
WORKDIR ${APP_ROOT}
ADD . ${APP_ROOT}

RUN npm install

EXPOSE 8545

CMD [ "npm", "run", "node" ]
