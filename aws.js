'use strict';
const awsServerlessExpress = require('aws-serverless-express');
const express              = require('express');
const slackend             = require('./index');
const url                  = require('url');
const {SecretsManager,SNS} = require('aws-sdk');
const {WebClient}          = require('@slack/web-api');

let app,
    server,
    slack,
    secretsmanager,
    sns;

slackend.logger.debug.log = console.log.bind(console);
slackend.logger.info.log  = console.log.bind(console);
slackend.logger.warn.log  = console.log.bind(console);
slackend.logger.error.log = console.log.bind(console);

async function getApp() {
  if (!app) {
    await getEnv();
    app = express();
    app.use(process.env.BASE_PATH || process.env.BASE_URL || '/', slackend(), publish);
  }
  return app;
}

async function getEnv() {
  const secret = await secretsmanager.getSecretValue({SecretId: process.env.AWS_SECRET}).promise();
  return Object.assign(process.env, JSON.parse(secret.SecretString));
}

async function getServer() {
  if (!server) {
    server = awsServerlessExpress.createServer(await getApp());
  }
  return server;
}

async function getSlack() {
  if (!slack) {
    await getEnv();
    slack = new WebClient(process.env.SLACK_TOKEN);
  }
  return slack;
}

async function handler(event, context) {
  slackend.logger.info(`EVENT ${JSON.stringify(event)}`);
  await getServer();
  return await awsServerlessExpress.proxy(server, event, context, 'PROMISE').promise;
}

function post(method) {
  return async (event) => {
    slackend.logger.info(`EVENT ${JSON.stringify(event)}`);
    await getSlack();
    const func = slack.chat[method];
    const msgs = event.Records.map((rec) => JSON.parse(rec.Sns.Message));
    return await Promise.all(msgs.map((msg) => {
      slackend.logger.info(`slack.chat.${method} ${JSON.stringify(msg)}`);
      return func(msg);
    }));
  };
}

function publishOptions(req, res) {
  let attrs = {};
  if (res.locals.slack.type) {
    attrs.type = stringMessageAttribute(res.locals.slack.type);
  }
  if (res.locals.slack.id) {
    attrs.id = stringMessageAttribute(res.locals.slack.id);
  }
  if (res.locals.slack.callback_id) {
    attrs.callback_id = stringMessageAttribute(res.locals.slack.callback_id);
  }
  return {
    Message:  JSON.stringify(res.locals.slack.message),
    TopicArn: process.env.AWS_SNS_TOPIC_ARN,
    MessageAttributes: attrs,
  };
}

function publishHandler(req, res) {
  if (req.path === '/oauth') {
    let uri        = process.env.SLACK_OAUTH_SUCCESS_URI       || 'slack://channel?team={TEAM_ID}&id={CHANNEL_ID}',
        channel_id = res.locals.slack.message.incoming_webhook && res.locals.slack.message.incoming_webhook.channel_id,
        team_id    = res.locals.slack.message.team_id;
    uri = uri.replace('{TEAM_ID}',    team_id);
    uri = uri.replace('{CHANNEL_ID}', channel_id);
    uri = url.parse(uri, true).format();
    res.redirect(uri);
  } else {
    slackend.logger.info(`RESPONSE [204]`);
    res.status(204).send();
  }
}

function publish(req, res) {
  let options = publishOptions(req, res);
  slackend.logger.info(`PUBLISH ${JSON.stringify(options)}`);
  return sns.publish(options).promise()
    .then(() => publishHandler(req, res))
    .catch((err) => {
      slackend.logger.warn(`RESPONSE [400] ${JSON.stringify(err)}`);
      res.status(400).send(err);
    });
}

function stringMessageAttribute(value) {
  return {
    DataType:    'String',
    StringValue: `${value}`,
  };
}

exports = module.exports = (options = {}) => {
  app            = options.app;
  server         = options.server;
  slack          = options.slack;
  secretsmanager = options.secretsmanager || new SecretsManager();
  sns            = options.sns || new SNS();

  return {
    getApp:        getApp,
    getEnv:        getEnv,
    getServer:     getServer,
    getSlack:      getSlack,
    handler:       handler,
    postEphemeral: post('postEphemeral'),
    postMessage:   post('postMessage'),
    publish:       publish,
  }
};
exports.logger = slackend.logger;
