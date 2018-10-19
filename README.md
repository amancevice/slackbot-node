# Asynchronous Slackbot

A simple, asynchronous back end for your Slack app.

The service intentionally does very little: it accepts an incoming request, verifies its origin, and publishes the payload to a queue/trigger for asynchronous processing.

Endpoints are provided for:

- `/callbacks` publishes [interactive messages](https://api.slack.com/interactive-messages)
- `/events` publishes events from the [Events API](https://api.slack.com/events-api)
- `/slash/:cmd` publishes [slash commands](https://api.slack.com/slash-commands)
- `/oauth` completes the [OAuth2](https://api.slack.com/docs/oauth) workflow

Without additional configuration, request payloads are simply published to `console.log`.

In production it is expected that users will attach their own publishing functions to connect to a messaging service like [Amazon SNS](https://aws.amazon.com/sns/), or [Google Pub/Sub](https://cloud.google.com/pubsub/docs/).

The fetching of additional/secret environmental values necessary for connecting to external services is also configurable.

**Advantages**

- Separates the concerns of responding to incoming requests and the logic to handle them.
  - Handlers can be added/removed independently of this app; deploy once and forget.
  - Requests can be published to any platform.
  - Handlers can be written in any language supported by the topic trigger.
- Designed to work within serverless frameworks, such as [AWS Lambda](https://aws.amazon.com/lambda/) or [Google Cloud Functions](https://cloud.google.com/functions/docs/).
- Authenticates requests using Slack's [signing secrets](https://api.slack.com/docs/verifying-requests-from-slack) so you'll know that events published to internal triggers/queues are verified.

**Drawbacks**

- Slack has a strict 3-second lifetime for many API operations, so it is critical that your asynchronous tasks complete quickly. Cold start times of some serverless computing platforms may be prohibitively slow.

## Local Setup

Run a local instance of your slack app by cloning this repository, configuring settings, installing dependencies, and starting the express server.

Configure settings by copying [`.env.example`](./.env.example) to `.env` and adding your keys/settings.

```bash
cp .env.example .env
```

Install dependencies using `npm` or `docker-compose`:

```bash
npm install
# or
docker-compose run --rm npm install
```

Start the server:

```bash
npm start
```

Send a sample request:

```bash
# Callback
curl -X POST \
  -H 'Content-Type: application/json' \
  -d '{"callback_id": "fizz"}' \
  'http://localhost:3000/callbacks'

# Event
curl -X POST \
  -H 'Content-Type: application/json' \
  -d '{"type": "event_callback", "event": {"type": "team_join"}}' \
  'http://localhost:3000/events'


# Slash command
curl -X POST -d 'fizz=buzz' 'http://localhost:3000/slash/fizz'
```

## Deploy to AWS Lambda

Deploy directly to AWS using [`terraform`](https://terraform.io) and the [`slackbot`](https://github.com/amancevice/terraform-aws-slackbot) module:


```terraform
module "slackbot" {
  source                  = "amancevice/slackbot/aws"
  api_description         = "My Slackbot REST API"
  api_name                = "slackbot"
  api_stage_name          = "v1"
  slack_bot_access_token  = "<slack-bot-access-token>"
  slack_client_id         = "<slack-client-id>"
  slack_client_secret     = "<slack-client-secret>"
  slack_signing_secret    = "<slack-signing-secret>"
  slack_user_access_token = "<slack-user-access-token>"
  slack_workspace_token   = "<slack-workspace-token>"
}
```

## Customization

Set app values for `fetchEnv` and `publish` to customize the app's behavior.

The [`lambda.js`](./lambda.js) script shows how to deploy the app using AWS SecretsManager to fetch Slack secrets and SNS to publish requests.

```javascript
'use strict';
const awsServerlessExpress = require('aws-serverless-express');
const app = require('slackend');

app.set('fetchEnv', () => {
  // Get ENV values
});

app.set('publish', (payload, topic) => {
  // Publish `payload` to `topic`
});

const server = awsServerlessExpress.createServer(app);
exports.handler = (event, context) => awsServerlessExpress.proxy(server, event, context);
```

### Environment

Supply additional environmental variables by setting the `fetchEnv` value of the app to a function that takes no arguments and returns a promise to update and return `process.env`.

Example:

```javascript
app.set('fetchEnv', () => {
  return Promise.resolve(process.env);
});
```

### Publishing

Set the `publish` value of the app to a function that takes a `payload` and `topic` and returns a promise to publish.

Example:

```javascript
app.set('publish', (payload, topic) => {
  return Promise.resolve({
    topic: topic,
    payload: payload
  }).then(console.log);
});
```
