// This gets called from mocha.opts

const app = require("../dist/app");
const mongodb = require("mongodb");
const ngrok = require("ngrok");
const inspect = require("util").inspect; // or directly

require("dotenv").config;

before(async () => {
  process.removeAllListeners("uncaughtException");
  process.removeAllListeners("unhandledRejection");
  let mongoClient;
  mongoClient = await mongodb.connect(
    process.env.MONGODB_URI,
    { useNewUrlParser: true }
  );

  try {
    await mongoClient.db().collection("sessions").drop();
    console.log('Dropped "sessions" collection');
  } catch (err) {}
  try {
    await mongoClient.db().collection("users").drop();
    console.log('Dropped "users" collection');
  } catch (err) {}

  let url;
  try {
    url = await ngrok.connect(process.env.PORT);
  } catch (err) {
    console.log(err);
  }
  console.log("Listening for webhooks at", url);
  await app.startServer(url);
});

after(async () => {
  // Heroku will call SIGTERM every day so let's test it out!
  setImmediate(() => {
    // otherwise we might kill before stack traces are printed
    process.kill(process.pid, "SIGTERM");
  });
});
